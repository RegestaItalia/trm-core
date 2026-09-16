import { createHash, randomUUID } from "crypto";
import { Logger } from "trm-commons";
import { AbstractRegistry } from "../../../registry";
import { ActionLockKey, SystemConnector } from "../../../systemConnector";

export type LockResource = { type: "PACKAGE" | "DEVCLASS" | "OBJECT" | "TRANSPORT" | "NAMESPACE"; name: string };

/** Keep the same canonical key across separate processes and both SAP transports. */
export function actionLockKey(resource: LockResource): ActionLockKey {
    const name = resource.type === "PACKAGE"
        ? resource.name.trim()
        : resource.name.trim().toUpperCase();
    if (!name || name.length > 255) {
        throw new Error(`Invalid ${resource.type} lock resource name.`);
    }
    return {
        resourceType: resource.type,
        resourceHash: createHash("sha256").update(resource.type).update("\0").update(name).digest("hex").toUpperCase(),
        resourceName: name
    };
}

export function packageLockResource(registry: AbstractRegistry, name: string): LockResource {
    return { type: "PACKAGE", name: `${name.trim().toLowerCase()} [${registry.endpoint.trim()}]` };
}

export function objectLockResource(object: { pgmid: string; object: string; objName: string }): LockResource {
    return { type: "OBJECT", name: `${object.pgmid.trim().toUpperCase()} ${object.object.trim().toUpperCase()} ${object.objName.trim().toUpperCase()}` };
}

/** One non-expiring SAP lock owner; close only after workflow rollback has finished. */
export class ActionLockScope {
    private readonly ownerToken = randomUUID().replace(/-/g, "").toUpperCase();
    private readonly held = new Map<string, ActionLockKey>();

    constructor(private readonly actionName: string) { }

    async acquire(resources: LockResource[]): Promise<void> {
        const requested = resources.map(actionLockKey);
        const fresh = requested.filter(key => !this.held.has(`${key.resourceType}:${key.resourceHash}`));
        if (fresh.length === 0) {
            return;
        }
        fresh.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || a.resourceHash.localeCompare(b.resourceHash));
        try {
            await SystemConnector.acquireActionLocks(fresh, this.ownerToken, this.actionName);
        } catch (error) {
            // A response can fail after SAP commits. Release only rows owned by this token.
            try {
                await SystemConnector.releaseActionLocks(fresh, this.ownerToken);
            } catch (cleanupError) {
                Logger.warning(`Could not clean up uncertain action lock acquisition: ${String(cleanupError)}`);
            }
            throw error;
        }
        for (const key of fresh) {
            this.held.set(`${key.resourceType}:${key.resourceHash}`, key);
        }
    }

    async release(): Promise<void> {
        if (this.held.size === 0) {
            return;
        }
        const keys = [...this.held.values()];
        await SystemConnector.releaseActionLocks(keys, this.ownerToken);
        this.held.clear();
    }
}

/** Preserve the operation's first failure while still attempting lock cleanup. */
export async function withActionLockScope<T>(scope: ActionLockScope, work: () => Promise<T>): Promise<T> {
    let result: T;
    let firstError: unknown;
    try {
        result = await work();
    } catch (error) {
        firstError = error;
    }
    try {
        await scope.release();
    } catch (error) {
        firstError ||= error;
    }
    if (firstError) throw firstError;
    return result;
}
