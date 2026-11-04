import { Logger } from "trm-commons";
import { ActionLogWriter, assignTransportRole, currentActionLog, markActionRolledBack, recordTransportEvent, recordTransportImports, runWithActionLog, setActionLogWriter, startActionLog } from "./ActionLog";
import { transportRole } from "./transportRole";
import { logRegistry } from "./logRegistry";
import { setSessionId } from "../commons/session";
import { RegistryType } from "../registry/RegistryType";

function writer(): jest.Mocked<ActionLogWriter> {
    return {
        logActionStart: jest.fn().mockResolvedValue(undefined),
        logActionEnd: jest.fn().mockResolvedValue(undefined),
        logTransportEvents: jest.fn().mockResolvedValue(undefined)
    };
}

describe("action log", () => {
    let w: jest.Mocked<ActionLogWriter>;
    let warning: jest.SpyInstance;

    beforeEach(() => {
        w = writer();
        setActionLogWriter(w);
        setSessionId("session-1");
        warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        setActionLogWriter(undefined);
        jest.restoreAllMocks();
    });

    test("an action starts with the session, records its transport events and ends with the resolved version", async () => {
        let resolved: string | undefined;
        await runWithActionLog({ actionName: "install", packageName: "pkg", packageRegistry: "public", version: "latest", resolvedVersion: () => resolved }, async () => {
            await recordTransportEvent("TRMK900001", "CREATE", { role: "TADIR" });
            await recordTransportImports("TST", [{ trkorr: "TRMK900001", rc: 4 }, { trkorr: "TRMK900002", rc: -1 }]);
            resolved = "1.2.3";
        });

        const actionId = w.logActionStart.mock.calls[0][0].actionId;
        expect(actionId).toMatch(/^[0-9A-F]{32}$/);
        expect(w.logActionStart).toHaveBeenCalledWith({
            actionId, sessionId: "session-1", parentActionId: undefined, actionName: "install",
            packageName: "pkg", packageRegistry: "public", version: "latest"
        });
        expect(w.logTransportEvents.mock.calls).toEqual([
            [actionId, [{ trkorr: "TRMK900001", event: "CREATE", role: "TADIR" }]],
            [actionId, [
                { trkorr: "TRMK900001", event: "IMPORT", target: "TST", retcode: 4, role: undefined },
                { trkorr: "TRMK900002", event: "IMPORT", target: "TST", retcode: undefined, role: undefined }
            ]]
        ]);
        expect(w.logActionEnd).toHaveBeenCalledWith(actionId, "S", "1.2.3");
    });

    test("a failed action ends failed, and rolled back once anything was reverted", async () => {
        await expect(runWithActionLog({ actionName: "publish" }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
        await expect(runWithActionLog({ actionName: "publish" }, async () => {
            markActionRolledBack();
            throw new Error("boom");
        })).rejects.toThrow("boom");

        expect(w.logActionEnd.mock.calls.map(call => call[1])).toEqual(["F", "B"]);
    });

    test("a nested action is a child of the running one, and its events stay its own", async () => {
        await runWithActionLog({ actionName: "install", packageName: "parent" }, async () => {
            const parentId = currentActionLog()!.actionId;
            await runWithActionLog({ actionName: "install", packageName: "child" }, async () => {
                await recordTransportEvent("TRMK900002", "IMPORT");
            });
            await recordTransportEvent("TRMK900001", "IMPORT");
            const [, childStart] = w.logActionStart.mock.calls;
            expect(childStart[0].parentActionId).toBe(parentId);
            expect(w.logTransportEvents.mock.calls[0][0]).toBe(childStart[0].actionId);
            expect(w.logTransportEvents.mock.calls[1][0]).toBe(parentId);
        });
    });

    test("a retained rollback after the action ended is recorded under it, which ends rolled back", async () => {
        const scope = await startActionLog({ actionName: "install" });
        await scope.end(false);
        await scope.runRollback(async () => {
            await recordTransportEvent("TRMK900003", "DELETE");
        });

        expect(w.logTransportEvents).toHaveBeenCalledWith(scope.actionId, [{ trkorr: "TRMK900003", event: "DELETE", role: undefined }]);
        expect(w.logActionEnd.mock.calls.map(call => call[1])).toEqual(["S", "B"]);
    });

    test("a role assigned to a transport applies to its later events, and the first role wins", async () => {
        await runWithActionLog({ actionName: "cg3z" }, async () => {
            assignTransportRole("TRMK900004", "CG3Z");
            assignTransportRole("TRMK900004", "TADIR");
            await recordTransportEvent("TRMK900004", "FORWARD", { target: "TST" });
        });

        expect(w.logTransportEvents.mock.calls[0][1]).toEqual([{ trkorr: "TRMK900004", event: "FORWARD", target: "TST", role: "CG3Z" }]);
    });

    test("a failed write warns once and the action continues without logging", async () => {
        w.logTransportEvents.mockRejectedValue(new Error("Table busy."));

        await expect(runWithActionLog({ actionName: "install" }, async () => {
            await recordTransportEvent("TRMK900001", "CREATE");
            await recordTransportEvent("TRMK900001", "RELEASE");
            return "done";
        })).resolves.toBe("done");

        expect(w.logTransportEvents).toHaveBeenCalledTimes(1);
        expect(w.logActionEnd).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][0]).toBe("Could not write the TRM action log (transaction /ATRM/LOG): Table busy. The action continues without it.");
    });

    test("a failed start disables the whole action, and never changes its outcome", async () => {
        w.logActionStart.mockRejectedValue(new Error("FM not found"));

        await expect(runWithActionLog({ actionName: "install" }, async () => {
            await recordTransportEvent("TRMK900001", "CREATE");
            throw new Error("workflow failed");
        })).rejects.toThrow("workflow failed");

        expect(w.logTransportEvents).not.toHaveBeenCalled();
        expect(w.logActionEnd).not.toHaveBeenCalled();
    });

    test("a disabled action, e.g. a simulation, writes nothing", async () => {
        await runWithActionLog({ actionName: "install", enabled: false }, async () => {
            await recordTransportEvent("TRMK900001", "CREATE");
        });

        expect(w.logActionStart).not.toHaveBeenCalled();
        expect(w.logTransportEvents).not.toHaveBeenCalled();
        expect(w.logActionEnd).not.toHaveBeenCalled();
    });

    test("a child of a disabled action has no parent", async () => {
        await runWithActionLog({ actionName: "install", enabled: false }, async () => {
            await runWithActionLog({ actionName: "install" }, async () => undefined);
        });

        expect(w.logActionStart).toHaveBeenCalledTimes(1);
        expect(w.logActionStart.mock.calls[0][0].parentActionId).toBeUndefined();
    });

    test("events outside an action are not recorded", async () => {
        await recordTransportEvent("TRMK900001", "CREATE");
        await recordTransportImports("TST", [{ trkorr: "TRMK900001", rc: 0 }]);
        assignTransportRole("TRMK900001", "TADIR");
        markActionRolledBack();

        expect(w.logTransportEvents).not.toHaveBeenCalled();
    });
});

describe("transport role", () => {
    test.each([
        [{ trmIdentifier: "CUST", text: "@X1@TRM pkg 1.0.0" }, "CUST"],
        [{ trmIdentifier: "DEVC" }, "DEVC"],
        [{ text: "@X1@TRM (D) pkg 1.0.0" }, "DEVC"],
        [{ text: "@X1@TRM (L) pkg 1.0.0" }, "LANG"],
        [{ text: "@X1@TRM (BKP) pkg 1.0.0" }, "BKP"],
        [{ text: "@X1@TRM (DELE) pkg 1.0.0" }, "DELE"],
        [{ text: "@X1@TRM pkg 1.0.0", workbench: true }, "LAND"],
        [{ text: "@X1@TRM pkg 1.0.0" }, undefined],
        [{ text: "My transport", workbench: true }, undefined]
    ] as [any, string | undefined][])("%j is %s", (data, role) => {
        expect(transportRole(data)).toBe(role);
    });
});

describe("log registry", () => {
    test("is the registry key of the package data, and never throws", () => {
        expect(logRegistry({ getRegistryType: () => RegistryType.PUBLIC, endpoint: "https://registry" } as any)).toBe("public");
        expect(logRegistry({ getRegistryType: () => RegistryType.PRIVATE, endpoint: "https://registry" } as any)).toBe("https://registry");
        expect(logRegistry({ endpoint: "https://registry" } as any)).toBe("https://registry");
        expect(logRegistry(undefined)).toBeUndefined();
    });
});
