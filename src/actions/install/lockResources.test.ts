jest.mock("./checkTransports", () => ({
    checkObjectsLocks: jest.fn(),
    findExistingObjects: jest.fn(),
    existenceCheckObjects: jest.requireActual("./checkTransports").existenceCheckObjects
}));

import { Logger } from "trm-commons";
import { checkObjectsLocks, findExistingObjects } from "./checkTransports";
import { lockResources } from "./lockResources";

function context(replacements = [{ originalDevclass: "Z_SOURCE", installDevclass: "Z_TARGET" }]) {
    return {
        lockScope: { acquire: jest.fn().mockResolvedValue(undefined) },
        rawInput: {
            packageData: { registry: { endpoint: "/tmp/local-artifacts" } },
            installData: {
                checks: {},
                installDevclass: { replacements }
            }
        },
        runtime: {
            installRegistry: { endpoint: "registry" },
            package: { data: { manifest: { name: "package-a" } }, hierarchy: { devclass: "Z_SOURCE", sub: [] } },
            previousInstallPackages: [],
            existingObjects: [],
            transports: {
                devc: { binaries: { trkorr: "DEVK900001", entries: {
                    e071: [{ pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE" }],
                    tadir: [{ pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE" }]
                } } },
                tadir: { binaries: { trkorr: "DEVK900002", entries: {
                    e071: [{ pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED" }],
                    tadir: [{ pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED" }]
                } } },
                cust: []
            }
        }
    } as any;
}

describe("install lock coverage", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ["loading", "error", "warning"] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (checkObjectsLocks as jest.Mock).mockResolvedValue(undefined);
        (findExistingObjects as jest.Mock).mockResolvedValue([]);
    });

    test("locks mapped target packages and imported objects before dependency installation", async () => {
        const ctx = context();

        await lockResources.run(ctx);

        const resources = ctx.lockScope.acquire.mock.calls[0][0];
        expect(resources).toContainEqual({ type: "DEVCLASS", name: "Z_TARGET" });
        expect(resources).toContainEqual({ type: "OBJECT", name: "R3TR DEVC Z_TARGET" });
        expect(resources).not.toContainEqual({ type: "OBJECT", name: "R3TR DEVC Z_SOURCE" });
        expect(resources).toContainEqual({ type: "OBJECT", name: "R3TR CLAS Z_SHARED" });
        expect(resources).toContainEqual({ type: "TRANSPORT", name: "DEVK900002" });
        expect(resources).toContainEqual({ type: "PACKAGE", name: "package-a [registry]" });
        expect(resources.some((resource: any) => resource.type === "NAMESPACE")).toBe(false);
    });

    test("TRM comment rows are not locked: a dependency would collide with its parent install", async () => {
        const ctx = context();
        ctx.runtime.transports.tadir.binaries.entries.e071.push(
            { pgmid: "*", object: "ZTRM", objName: "name=package-a" },
            { pgmid: "*", object: "ZTRM", objName: "version=1.0.0" }
        );

        await lockResources.run(ctx);

        const resources = ctx.lockScope.acquire.mock.calls[0][0];
        expect(resources.filter((resource: any) => resource.type === "OBJECT" && resource.name.startsWith("*"))).toEqual([]);
        expect(resources).toContainEqual({ type: "OBJECT", name: "R3TR CLAS Z_SHARED" });
    });

    test("locks the custom install namespace", async () => {
        const ctx = context([{ originalDevclass: "Z_SOURCE", installDevclass: "/ACME/TARGET" }]);

        await lockResources.run(ctx);

        expect(ctx.lockScope.acquire.mock.calls[0][0]).toContainEqual({ type: "NAMESPACE", name: "/ACME/" });
        expect(ctx.runtime.lockedNamespaces).toEqual(["/ACME/"]);
    });

    test("a namespace locked by a parent install is not locked again", async () => {
        const ctx = context([{ originalDevclass: "Z_SOURCE", installDevclass: "/ACME/TARGET" }]);
        ctx.inheritedNamespaceLocks = ["/acme/"];

        await lockResources.run(ctx);

        expect(ctx.lockScope.acquire.mock.calls[0][0].some((resource: any) => resource.type === "NAMESPACE")).toBe(false);
        expect(ctx.runtime.lockedNamespaces).toEqual(["/ACME/"]);
    });

    test("objects locked in a transport after check-transports abort the install once locked", async () => {
        const ctx = context();
        (checkObjectsLocks as jest.Mock).mockRejectedValue(new Error("Install aborted. To continue, all objects must be released"));

        await expect(lockResources.run(ctx)).rejects.toThrow("all objects must be released");

        expect(ctx.lockScope.acquire).toHaveBeenCalledTimes(1);
        expect((checkObjectsLocks as jest.Mock).mock.calls[0][0]).toEqual([
            { pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE" },
            { pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED" }
        ]);
    });

    test("objects created after check-transports abort the install, accepted ones do not", async () => {
        const ctx = context();
        ctx.runtime.existingObjects = [{ pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE", devclass: "Z_SOURCE" }];
        (findExistingObjects as jest.Mock).mockResolvedValue([
            { pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE", devclass: "Z_SOURCE" },
            { pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED", devclass: "Z_OTHER" }
        ]);

        await expect(lockResources.run(ctx)).rejects.toThrow("1 object(s) were created");

        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining("R3TR CLAS Z_SHARED"), { important: true });
    });

    test("objects created after check-transports only warn with noExistingObjects", async () => {
        const ctx = context();
        ctx.rawInput.installData.checks.noExistingObjects = true;
        (findExistingObjects as jest.Mock).mockResolvedValue([
            { pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED", devclass: "Z_OTHER" }
        ]);

        await lockResources.run(ctx);

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining("R3TR CLAS Z_SHARED"), { important: true });
    });
});
