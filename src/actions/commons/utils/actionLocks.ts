import { createHash, randomUUID } from "crypto";
import { Logger } from "trm-commons";
import { ClientError } from "../../../client";
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
            if (error instanceof ClientError && error.sapMessage) {
                // SAP answered and rejected the request: nothing was locked for this owner.
                if (/lock held/i.test(error.message)) {
                    error.message = `${error.message}. If no other TRM action is running, the lock was left by an interrupted action: delete it with transaction /ATRM/LOCK.`;
                }
                throw error;
            }
            // A response can fail after SAP commits. Release only rows owned by this token.
            try {
                await SystemConnector.releaseActionLocks(fresh, this.ownerToken);
            } catch (cleanupError) {
                Logger.warning(`Could not clean up uncertain action lock acquisition: ${String(cleanupError)}`, { important: true });
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
        try {
            await SystemConnector.releaseActionLocks(keys, this.ownerToken);
        } catch (error) {
            // Locks never expire: name them so they can be deleted with transaction /ATRM/LOCK.
            const resources = keys.map(key => `${key.resourceType} ${key.resourceName}`).join(", ");
            Logger.warning(`Could not release ${this.actionName} action locks owned by ${this.ownerToken} (${resources}): ${error instanceof Error ? error.message : String(error)}. Delete them with transaction /ATRM/LOCK.`, { important: true });
            throw error;
        }
        this.held.clear();
    }
}

/**
 * Runs the work, then releases its locks once. A release failure is logged by the lock scope:
 * after a success it doesn't reject the committed action, after a failure it never masks it.
 */
export async function withLockRelease<T>(release: () => Promise<void>, work: () => Promise<T>): Promise<T> {
    let result: T;
    try {
        result = await work();
    } catch (error) {
        await releaseLogged(release);
        throw error;
    }
    await releaseLogged(release);
    return result;
}

/** Releases locks whose failure was already logged by their {@link ActionLockScope}. */
export async function releaseLogged(release: () => Promise<void>): Promise<void> {
    try {
        await release();
    } catch {
        // Logged with resources and owner token by ActionLockScope.release.
    }
}

/** Preserve the operation's result or failure while still attempting lock cleanup. */
export function withActionLockScope<T>(scope: ActionLockScope, work: () => Promise<T>): Promise<T> {
    return withLockRelease(() => scope.release(), work);
}
