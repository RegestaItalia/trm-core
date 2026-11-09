jest.mock('../commons', () => ({
    ...jest.requireActual('../commons'),
    executeWorkflow: jest.fn()
}));
jest.mock('../commons/utils', () => ({
    ...jest.requireActual('../commons/utils'),
    executeRetainedWorkflow: jest.fn()
}));

import { Logger } from "trm-commons";
import { executeWorkflow } from "../commons";
import { ActionLockScope, executeRetainedWorkflow } from "../commons/utils";
import { SystemConnector } from "../../systemConnector";
import { uninstall, uninstallWithRollback } from ".";

describe("uninstall action-lock release", () => {
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
        (executeWorkflow as jest.Mock).mockReset();
        (executeRetainedWorkflow as jest.Mock).mockReset();
    });

    afterEach(() => warning.mockRestore());

    test("a release failure after a committed uninstall is logged and the uninstall resolves", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "pkg" } } });
        release.mockRejectedValueOnce(new Error("release failed"));
        await expect(uninstall(inputData)).resolves.toEqual({ manifest: { name: "pkg" } });
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][0]).toContain(acquire.mock.calls[0][1]);
    });

    test("a failed uninstall releases once and rejects with the workflow failure", async () => {
        (executeWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));
        release.mockRejectedValueOnce(new Error("release failed"));
        await expect(uninstall(inputData)).rejects.toThrow("workflow failed");
        expect(executeWorkflow).toHaveBeenCalledWith("uninstall", expect.any(Array), expect.any(Object), expect.any(Object));
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning).toHaveBeenCalledTimes(1);
    });

    test("a retained uninstall keeps its locks until release, and rollback still releases them", async () => {
        const rollback = jest.fn().mockResolvedValue(undefined);
        (executeRetainedWorkflow as jest.Mock).mockResolvedValue({ context: { output: { manifest: { name: "pkg" } } }, rollback });
        const retained = await uninstallWithRollback(inputData, []);
        expect(release).not.toHaveBeenCalled();
        await retained.rollback();
        expect(rollback).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        await retained.release();
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("a failed retained uninstall releases once and rejects with the workflow failure", async () => {
        (executeRetainedWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));
        await expect(uninstallWithRollback(inputData, [])).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("a nested uninstall locks in its parent scope and leaves the release to the parent", async () => {
        const parent = new ActionLockScope("uninstall");
        await parent.acquire([{ type: "DEVCLASS", name: "ZNESTED" }]);
        const rollback = jest.fn().mockResolvedValue(undefined);
        (executeRetainedWorkflow as jest.Mock).mockImplementation(async (_name, _workflow, context) => {
            // The parent cleanup of the same SAP package must not collide with the nested uninstall.
            await context.lockScope.acquire([{ type: "DEVCLASS", name: "ZNESTED" }]);
            return { context: { output: { manifest: { name: "pkg" } } }, rollback };
        });

        const retained = await uninstallWithRollback(inputData, [], parent);
        await parent.acquire([{ type: "DEVCLASS", name: "ZNESTED" }]);
        await retained.rollback();
        await retained.release();

        expect(acquire).toHaveBeenCalledTimes(2);
        expect(acquire.mock.calls[1][1]).toBe(acquire.mock.calls[0][1]);
        expect(release).not.toHaveBeenCalled();
        await parent.release();
        expect(release).toHaveBeenCalledTimes(1);
        expect(release.mock.calls[0][0]).toHaveLength(2);
    });

    test("a retained uninstall rolled back by its parent ends rolled back in the action log, and its rollback runs as it", async () => {
        const { currentActionLog } = jest.requireActual("../../actionLog");
        let rollbackActionId: string | undefined;
        const rollback = jest.fn(async () => { rollbackActionId = currentActionLog()?.actionId; });
        (executeRetainedWorkflow as jest.Mock).mockResolvedValue({ context: { output: { manifest: { name: "pkg" } } }, rollback });
        const retained = await uninstallWithRollback(inputData, []);
        await retained.rollback();

        const start = (SystemConnector.logActionStart as jest.Mock).mock.calls.at(-1)[0];
        expect(rollbackActionId).toBe(start.actionId);
        expect((SystemConnector.logActionEnd as jest.Mock).mock.calls.filter(call => call[0] === start.actionId).map(call => call[1])).toEqual(["S", "B"]);
    });

    test("a failing action log never fails the uninstall or its lock release", async () => {
        (SystemConnector.logActionStart as jest.Mock).mockRejectedValueOnce(new Error("log down"));
        (executeWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));

        await expect(uninstall(inputData)).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
    });
});
