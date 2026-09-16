import { ActionLockScope, actionLockKey, packageLockResource, withActionLockScope } from "./actionLocks";
import { SystemConnector } from "../../../systemConnector";

describe("persistent action lock scope", () => {
    const acquire = jest.spyOn(SystemConnector, "acquireActionLocks");
    const release = jest.spyOn(SystemConnector, "releaseActionLocks");

    beforeEach(() => {
        acquire.mockReset().mockResolvedValue(undefined);
        release.mockReset().mockResolvedValue(undefined);
    });

    test("canonical resources share a key, while distinct resources do not", () => {
        const a = actionLockKey({ type: "OBJECT", name: "r3tr clas z_demo" });
        const b = actionLockKey({ type: "OBJECT", name: "R3TR CLAS Z_DEMO" });
        const c = actionLockKey({ type: "DEVCLASS", name: "Z_DEMO" });
        expect(a).toEqual(b);
        expect(a.resourceHash).not.toBe(c.resourceHash);
        expect(packageLockResource({ endpoint: "registry" } as any, " Foo ").name)
            .toBe("foo [registry]");
    });

    test("acquires new keys only and releases all with the same owner", async () => {
        const scope = new ActionLockScope("install");
        await scope.acquire([{ type: "DEVCLASS", name: "Z_A" }]);
        await scope.acquire([{ type: "DEVCLASS", name: "z_a" }, { type: "DEVCLASS", name: "Z_B" }]);
        expect(acquire).toHaveBeenCalledTimes(2);
        const owner = acquire.mock.calls[0][1];
        expect(owner).toMatch(/^[A-F0-9]{32}$/);
        expect(acquire.mock.calls[1][1]).toBe(owner);
        await scope.release();
        await scope.release();
        expect(release).toHaveBeenCalledTimes(1);
        expect(release.mock.calls[0][0]).toHaveLength(2);
        expect(release.mock.calls[0][1]).toBe(owner);
    });

    test("uncertain acquisition attempts token-scoped cleanup and keeps the original error", async () => {
        acquire.mockRejectedValueOnce(new Error("response lost"));
        release.mockRejectedValueOnce(new Error("cleanup failed"));
        const scope = new ActionLockScope("install");
        await expect(scope.acquire([{ type: "DEVCLASS", name: "Z_A" }])).rejects.toThrow("response lost");
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("cleanup runs after the work fails and never masks its error", async () => {
        const events: string[] = [];
        const scope = new ActionLockScope("publish");
        acquire.mockImplementation(async () => { events.push("acquire"); });
        release.mockImplementation(async () => { events.push("release"); throw new Error("release failed"); });
        await scope.acquire([{ type: "PACKAGE", name: "pkg [registry]" }]);
        await expect(withActionLockScope(scope, async () => {
            events.push("work");
            throw new Error("work failed");
        })).rejects.toThrow("work failed");
        expect(events).toEqual(["acquire", "work", "release"]);
    });
});
