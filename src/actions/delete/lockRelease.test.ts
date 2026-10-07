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
import { executeRetainedWorkflow } from "../commons/utils";
import { SystemConnector } from "../../systemConnector";
import { deletePackage, deleteWithRollback } from ".";

describe("delete action-lock release", () => {
    const acquire = jest.spyOn(SystemConnector, "acquireActionLocks");
    const release = jest.spyOn(SystemConnector, "releaseActionLocks");
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

    test("a release failure after a committed delete is logged and the delete resolves", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { manifest: { name: "pkg" } } });
        release.mockRejectedValueOnce(new Error("release failed"));
        await expect(deletePackage(inputData)).resolves.toEqual({ manifest: { name: "pkg" } });
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][0]).toContain(acquire.mock.calls[0][1]);
    });

    test("a failed delete releases once and rejects with the workflow failure", async () => {
        (executeWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));
        release.mockRejectedValueOnce(new Error("release failed"));
        await expect(deletePackage(inputData)).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning).toHaveBeenCalledTimes(1);
    });

    test("a retained delete keeps its locks until release, and rollback still releases them", async () => {
        const rollback = jest.fn().mockResolvedValue(undefined);
        (executeRetainedWorkflow as jest.Mock).mockResolvedValue({ context: { output: { manifest: { name: "pkg" } } }, rollback });
        const retained = await deleteWithRollback(inputData, []);
        expect(release).not.toHaveBeenCalled();
        await retained.rollback();
        expect(rollback).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        await retained.release();
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("a failed retained delete releases once and rejects with the workflow failure", async () => {
        (executeRetainedWorkflow as jest.Mock).mockRejectedValue(new Error("workflow failed"));
        await expect(deleteWithRollback(inputData, [])).rejects.toThrow("workflow failed");
        expect(release).toHaveBeenCalledTimes(1);
    });
});
