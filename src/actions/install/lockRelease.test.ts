jest.mock('../commons', () => ({
    ...jest.requireActual('../commons'),
    executeWorkflow: jest.fn()
}));
jest.mock('../commons/utils', () => ({
    ...jest.requireActual('../commons/utils'),
    executeRetainedWorkflow: jest.fn(),
    resolveInstallPackage: jest.fn(),
    getMissingTrmBackendApis: jest.fn()
}));

import { Logger } from "trm-commons";
import { executeWorkflow } from "../commons";
import { executeRetainedWorkflow, getMissingTrmBackendApis, resolveInstallPackage } from "../commons/utils";
import { SystemConnector } from "../../systemConnector";
import { install, installWithRollback } from ".";

describe("install action-lock release", () => {
    const acquire = jest.spyOn(SystemConnector, "acquireActionLocks");
    const release = jest.spyOn(SystemConnector, "releaseActionLocks");
    // The action log is covered by its own tests.
    jest.spyOn(SystemConnector, "logActionStart").mockResolvedValue(undefined);
    jest.spyOn(SystemConnector, "logActionEnd").mockResolvedValue(undefined);
    jest.spyOn(SystemConnector, "logTransportEvents").mockResolvedValue(undefined);
    let warning: jest.SpyInstance;
    const inputData = { packageData: { name: "pkg", registry: { endpoint: "registry" } } } as any;

    beforeEach(() => {
        acquire.mockReset().mockResolvedValue(undefined);
        release.mockReset().mockResolvedValue(undefined);
        warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined);
        (resolveInstallPackage as jest.Mock).mockReset().mockResolvedValue({ name: "pkg", registry: { endpoint: "registry", getRegistryType: () => 2 } });
        (executeWorkflow as jest.Mock).mockReset();
        (executeRetainedWorkflow as jest.Mock).mockReset();
        (getMissingTrmBackendApis as jest.Mock).mockReset().mockResolvedValue([]);
    });

    afterEach(() => warning.mockRestore());

    test("a release failure after a committed install is logged and the install resolves", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "pkg" } } });
        release.mockRejectedValueOnce(new Error("release failed"));
        await expect(install(inputData)).resolves.toEqual({ manifest: { name: "pkg" } });
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][0]).toContain(acquire.mock.calls[0][1]);
    });

    test("a failed install releases once and rejects with the workflow failure", async () => {
        (executeWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));
        release.mockRejectedValueOnce(new Error("release failed"));
        await expect(install(inputData)).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning).toHaveBeenCalledTimes(1);
    });

    test("a retained install keeps its locks until release, and rollback still releases them", async () => {
        const rollback = jest.fn().mockResolvedValue(undefined);
        (executeRetainedWorkflow as jest.Mock).mockResolvedValue({ context: { output: { manifest: { name: "pkg" } } }, rollback });
        const retained = await installWithRollback(inputData);
        expect(release).not.toHaveBeenCalled();
        await retained.rollback();
        expect(rollback).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        await retained.release();
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("a failed retained install releases once and rejects with the workflow failure", async () => {
        (executeRetainedWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));
        await expect(installWithRollback(inputData)).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("a retained install receives the namespaces locked by its parent", async () => {
        (executeRetainedWorkflow as jest.Mock).mockResolvedValue({ context: { output: { manifest: { name: "pkg" } } }, rollback: jest.fn() });
        await installWithRollback(inputData, ["/ACME/"]);
        expect((executeRetainedWorkflow as jest.Mock).mock.calls[0][2].inheritedNamespaceLocks).toEqual(["/ACME/"]);
    });

    test.each(["trm-server", "trm-rest"])("%s upgrades a backend without trmServer7, which has no action locks, without them", async name => {
        const registry = { endpoint: "public", getRegistryType: () => 1 };
        (resolveInstallPackage as jest.Mock).mockResolvedValue({ name, registry });
        (getMissingTrmBackendApis as jest.Mock).mockResolvedValue(['trmServer7', 'trmServer8']);
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name } } });

        await install({ packageData: { name, registry } } as any);

        expect(acquire).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
        expect((executeWorkflow as jest.Mock).mock.calls[0][2].missingBackendApis).toEqual(['trmServer7', 'trmServer8']);
    });

    test("trm-server is locked on a backend that only lacks newer APIs than the action locks", async () => {
        const registry = { endpoint: "public", getRegistryType: () => 1 };
        (resolveInstallPackage as jest.Mock).mockResolvedValue({ name: "trm-server", registry });
        (getMissingTrmBackendApis as jest.Mock).mockResolvedValue(['trmServer8']);
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "trm-server" } } });

        await install({ packageData: { name: "trm-server", registry } } as any);

        expect(acquire).toHaveBeenCalledTimes(1);
        expect((executeWorkflow as jest.Mock).mock.calls[0][2].missingBackendApis).toEqual(['trmServer8']);
    });

    test("trm-server is locked on a backend with action locks", async () => {
        const registry = { endpoint: "public", getRegistryType: () => 1 };
        (resolveInstallPackage as jest.Mock).mockResolvedValue({ name: "trm-server", registry });
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "trm-server" } } });

        await install({ packageData: { name: "trm-server", registry } } as any);

        expect(acquire).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        expect((executeWorkflow as jest.Mock).mock.calls[0][2].missingBackendApis).toEqual([]);
    });

    test("the backend generation is only read for trm-server and trm-rest", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "pkg" } } });

        await install(inputData);

        expect(getMissingTrmBackendApis).not.toHaveBeenCalled();
        expect((executeWorkflow as jest.Mock).mock.calls[0][2].missingBackendApis).toEqual([]);
    });

    test("an ordinary package still requires the action-lock APIs", async () => {
        acquire.mockRejectedValueOnce(new Error("METHOD_CALL_EXCEPTION"));

        await expect(install(inputData)).rejects.toThrow("METHOD_CALL_EXCEPTION");
        expect(executeWorkflow).not.toHaveBeenCalled();
    });

    test("a retained install rolled back by its parent ends rolled back in the action log, and its rollback runs as it", async () => {
        const { currentActionLog } = jest.requireActual("../../actionLog");
        let rollbackActionId: string | undefined;
        const rollback = jest.fn(async () => { rollbackActionId = currentActionLog()?.actionId; });
        (executeRetainedWorkflow as jest.Mock).mockResolvedValue({ context: { output: { manifest: { name: "pkg" } } }, rollback });
        const retained = await installWithRollback(inputData);
        await retained.rollback();

        const start = (SystemConnector.logActionStart as jest.Mock).mock.calls.at(-1)[0];
        expect(rollbackActionId).toBe(start.actionId);
        expect((SystemConnector.logActionEnd as jest.Mock).mock.calls.filter(call => call[0] === start.actionId).map(call => call[1])).toEqual(["S", "B"]);
    });

    test("a failing action log never fails the install or its lock release", async () => {
        (SystemConnector.logActionStart as jest.Mock).mockRejectedValueOnce(new Error("log down"));
        (executeWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));

        await expect(install(inputData)).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("trm-server upgrades a backend without the action log without writing it", async () => {
        const registry = { endpoint: "public", getRegistryType: () => 1 };
        (resolveInstallPackage as jest.Mock).mockResolvedValue({ name: "trm-server", registry });
        (getMissingTrmBackendApis as jest.Mock).mockResolvedValue(['trmServer81']);
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "trm-server" } } });
        (SystemConnector.logActionStart as jest.Mock).mockClear();

        await install({ packageData: { name: "trm-server", registry } } as any);

        expect(SystemConnector.logActionStart).not.toHaveBeenCalled();
        expect(acquire).toHaveBeenCalledTimes(1);
    });

    test("a simulated install writes no action log", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "pkg" } } });
        (SystemConnector.logActionStart as jest.Mock).mockClear();

        await install({ ...inputData, contextData: { simulate: true } });

        expect(SystemConnector.logActionStart).not.toHaveBeenCalled();
    });
});
