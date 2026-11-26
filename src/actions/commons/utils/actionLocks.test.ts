import { ActionLockScope, actionLockKey, packageLockResource, releaseOpenActionLocks, withActionLockScope, withLockRelease } from "./actionLocks";
import { ClientError } from "../../../client";
import { SystemConnector } from "../../../systemConnector";
import { Logger } from "trm-commons";

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

    test("a resource requested more than once in one call is sent once", async () => {
        const scope = new ActionLockScope("install");
        await scope.acquire([{ type: "DEVCLASS", name: "Z_A" }, { type: "DEVCLASS", name: "z_a" }, { type: "OBJECT", name: "R3TR CLAS Z_C" }]);
        expect(acquire.mock.calls[0][0]).toHaveLength(2);
    });

    test("uncertain acquisition attempts token-scoped cleanup and keeps the original error", async () => {
        acquire.mockRejectedValueOnce(new Error("response lost"));
        release.mockRejectedValueOnce(new Error("cleanup failed"));
        const scope = new ActionLockScope("install");
        await expect(scope.acquire([{ type: "DEVCLASS", name: "Z_A" }])).rejects.toThrow("response lost");
        expect(release).toHaveBeenCalledTimes(1);
    });

    test("a lock held by another owner is rejected by SAP: no cleanup, stale-lock hint", async () => {
        acquire.mockRejectedValueOnce(new ClientError("ENQUEUE_ERROR", { class: "00", no: "001" }, "Action lock held: PACKAGE pkg [registry] by USER"));
        const scope = new ActionLockScope("publish");
        await expect(scope.acquire([{ type: "PACKAGE", name: "pkg [registry]" }])).rejects.toThrow(
            "Action lock held: PACKAGE pkg [registry] by USER. If no other TRM action is running, the lock was left by an interrupted action: delete it with transaction /ATRM/LOCK."
        );
        expect(release).not.toHaveBeenCalled();
    });

    test("other SAP rejections are rethrown unchanged without cleanup", async () => {
        acquire.mockRejectedValueOnce(new ClientError("NO_AUTH", { class: "00", no: "001" }, "Not authorized"));
        const scope = new ActionLockScope("install");
        await expect(scope.acquire([{ type: "DEVCLASS", name: "Z_A" }])).rejects.toThrow(/^Not authorized$/);
        expect(release).not.toHaveBeenCalled();
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

    test("a failed release logs the resources and owner token, keeps the locks held and rethrows", async () => {
        const warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined);
        try {
            const scope = new ActionLockScope("uninstall");
            await scope.acquire([{ type: "DEVCLASS", name: "Z_A" }]);
            release.mockRejectedValueOnce(new Error("release failed"));
            await expect(scope.release()).rejects.toThrow("release failed");
            const owner = acquire.mock.calls[0][1];
            expect(warning).toHaveBeenCalledTimes(1);
            expect(warning.mock.calls[0][0]).toContain(owner);
            expect(warning.mock.calls[0][0]).toContain("DEVCLASS Z_A");
            expect(warning.mock.calls[0][0]).toContain("/ATRM/LOCK");
            await scope.release();
            expect(release).toHaveBeenCalledTimes(2);
        } finally {
            warning.mockRestore();
        }
    });

    test("a release failure after success is logged and does not reject the committed work", async () => {
        const warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined);
        try {
            const scope = new ActionLockScope("cg3z");
            await scope.acquire([{ type: "TRANSPORT", name: "A4HK900001" }]);
            release.mockRejectedValueOnce(new Error("release failed"));
            await expect(withActionLockScope(scope, async () => "done")).resolves.toBe("done");
            expect(release).toHaveBeenCalledTimes(1);
            expect(warning).toHaveBeenCalledTimes(1);
        } finally {
            warning.mockRestore();
        }
    });

    test("release runs once after success and once after failure", async () => {
        let calls = 0;
        const countRelease = async () => { calls++; throw new Error("release failed"); };
        await expect(withLockRelease(countRelease, async () => 1)).resolves.toBe(1);
        expect(calls).toBe(1);
        await expect(withLockRelease(countRelease, async () => { throw new Error("work failed"); })).rejects.toThrow("work failed");
        expect(calls).toBe(2);
    });

    describe("client guard releasing open scopes", () => {
        beforeEach(async () => {
            // Scopes left open by earlier tests are released by the guard itself
            await releaseOpenActionLocks();
            release.mockReset().mockResolvedValue(undefined);
        });

        test("retries scopes whose release failed and continues after a failure, without throwing", async () => {
            const warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined);
            try {
                const first = new ActionLockScope("install");
                const second = new ActionLockScope("uninstall");
                await first.acquire([{ type: "DEVCLASS", name: "Z_A" }]);
                await second.acquire([{ type: "DEVCLASS", name: "Z_B" }]);
                release.mockRejectedValueOnce(new Error("release failed"));
                await expect(first.release()).rejects.toThrow("release failed");
                release.mockRejectedValueOnce(new Error("still failing"));
                await expect(releaseOpenActionLocks()).resolves.toBeUndefined();
                expect(release).toHaveBeenCalledTimes(3);
                expect(release.mock.calls[1][0]).toEqual([actionLockKey({ type: "DEVCLASS", name: "Z_A" })]);
                expect(release.mock.calls[2][0]).toEqual([actionLockKey({ type: "DEVCLASS", name: "Z_B" })]);
                await releaseOpenActionLocks();
                expect(release).toHaveBeenCalledTimes(4);
                expect(release.mock.calls[3][0]).toEqual([actionLockKey({ type: "DEVCLASS", name: "Z_A" })]);
                await releaseOpenActionLocks();
                expect(release).toHaveBeenCalledTimes(4);
            } finally {
                warning.mockRestore();
            }
        });

        test("released and lockless scopes are not retried", async () => {
            const released = new ActionLockScope("publish");
            await released.acquire([{ type: "PACKAGE", name: "pkg [registry]" }]);
            await released.release();
            new ActionLockScope("cg3z");
            await new ActionLockScope("install", false).acquire([{ type: "DEVCLASS", name: "Z_A" }]);
            await releaseOpenActionLocks();
            expect(release).toHaveBeenCalledTimes(1);
        });

        test("an uncertain acquisition whose cleanup failed is retried with the same owner", async () => {
            const warning = jest.spyOn(Logger, "warning").mockImplementation(() => undefined);
            try {
                acquire.mockRejectedValueOnce(new Error("response lost"));
                release.mockRejectedValueOnce(new Error("cleanup failed"));
                const scope = new ActionLockScope("install");
                await expect(scope.acquire([{ type: "DEVCLASS", name: "Z_A" }])).rejects.toThrow("response lost");
                await releaseOpenActionLocks();
                expect(release).toHaveBeenCalledTimes(2);
                expect(release.mock.calls[1]).toEqual(release.mock.calls[0]);
            } finally {
                warning.mockRestore();
            }
        });
    });
});
