jest.mock('../commons', () => ({
    ...jest.requireActual('../commons'),
    executeWorkflow: jest.fn()
}));
jest.mock('../commons/utils', () => ({
    ...jest.requireActual('../commons/utils'),
    executeRetainedWorkflow: jest.fn(),
    resolveInstallPackage: jest.fn(),
    isLegacyTrmBackend: jest.fn()
}));

import { Logger } from "trm-commons";
import { executeWorkflow } from "../commons";
import { executeRetainedWorkflow, isLegacyTrmBackend, resolveInstallPackage } from "../commons/utils";
import { SystemConnector } from "../../systemConnector";
import { install, installWithRollback } from ".";

describe("install action-lock release", () => {
    const acquire = jest.spyOn(SystemConnector, "acquireActionLocks");
    const release = jest.spyOn(SystemConnector, "releaseActionLocks");
    let warning: jest.SpyInstance;
    const inputData = { packageData: { name: "pkg", registry: { endpoint: "registry" } } } as any;

    beforeEach(() => {
        acquire.mockReset().mockResolvedValue(undefined);
        release.mockReset().mockResolvedValue(undefined);
        warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined);
        (resolveInstallPackage as jest.Mock).mockReset().mockResolvedValue({ name: "pkg", registry: { endpoint: "registry", getRegistryType: () => 2 } });
        (executeWorkflow as jest.Mock).mockReset();
        (executeRetainedWorkflow as jest.Mock).mockReset();
        (isLegacyTrmBackend as jest.Mock).mockReset().mockResolvedValue(false);
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

    test.each(["trm-server", "trm-rest"])("%s upgrades a legacy backend, which has no action locks, without them", async name => {
        const registry = { endpoint: "public", getRegistryType: () => 1 };
        (resolveInstallPackage as jest.Mock).mockResolvedValue({ name, registry });
        (isLegacyTrmBackend as jest.Mock).mockResolvedValue(true);
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name } } });

        await install({ packageData: { name, registry } } as any);

        expect(acquire).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
        expect((executeWorkflow as jest.Mock).mock.calls[0][2].legacyBackend).toBe(true);
    });

    test("trm-server is locked on a backend with action locks", async () => {
        const registry = { endpoint: "public", getRegistryType: () => 1 };
        (resolveInstallPackage as jest.Mock).mockResolvedValue({ name: "trm-server", registry });
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "trm-server" } } });

        await install({ packageData: { name: "trm-server", registry } } as any);

        expect(acquire).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        expect((executeWorkflow as jest.Mock).mock.calls[0][2].legacyBackend).toBe(false);
    });

    test("the backend generation is only read for trm-server and trm-rest", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "pkg" } } });

        await install(inputData);

        expect(isLegacyTrmBackend).not.toHaveBeenCalled();
    });

    test("an ordinary package still requires the action-lock APIs", async () => {
        acquire.mockRejectedValueOnce(new Error("METHOD_CALL_EXCEPTION"));

        await expect(install(inputData)).rejects.toThrow("METHOD_CALL_EXCEPTION");
        expect(executeWorkflow).not.toHaveBeenCalled();
    });
});
