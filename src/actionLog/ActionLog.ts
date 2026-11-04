import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { Logger } from "trm-commons";
import type { ActionLogEvent, ActionLogStart, ActionLogStatus, ActionLogTransportEvent, ActionLogTransportRole } from "../client/struct/ActionLog";
import { getSessionId } from "../commons/session";

/**
 * Writes the SAP action log (transaction /ATRM/LOG). Registered by the system connector,
 * so this module doesn't depend on it.
 */
export interface ActionLogWriter {
    logActionStart: (action: ActionLogStart) => Promise<void>;
    logActionEnd: (actionId: string, status: ActionLogStatus, version?: string) => Promise<void>;
    logTransportEvents: (actionId: string, events: ActionLogEvent[]) => Promise<void>;
}

var _writer: ActionLogWriter | undefined;

export function setActionLogWriter(writer: ActionLogWriter | undefined): void {
    _writer = writer;
}

export interface ActionLogInfo {
    actionName: string;
    packageName?: string;
    packageRegistry?: string;
    /** Version requested, e.g. a range or `latest`. */
    version?: string;
    /** Version the action resolved, read when it ends. */
    resolvedVersion?: () => string | undefined;
    /** False to run without logging, e.g. a simulation or a backend without the action log. */
    enabled?: boolean;
}

/**
 * One TRM action in the SAP action log. Writing the log is best-effort: the first failure is a warning
 * and the rest of the action runs without logging. Nothing is ever reverted: a rollback is history too.
 */
export class ActionLogScope {
    public readonly actionId = randomUUID().replace(/-/g, "").toUpperCase();
    private _disabled: boolean;
    private _rolledBack = false;
    private readonly _roles = new Map<string, ActionLogTransportRole>();

    constructor(private readonly _info: ActionLogInfo, public readonly parent?: ActionLogScope) {
        this._disabled = _info.enabled === false;
    }

    public get enabled(): boolean {
        return !this._disabled;
    }

    public get rolledBack(): boolean {
        return this._rolledBack;
    }

    public markRolledBack(): void {
        this._rolledBack = true;
    }

    public async start(): Promise<void> {
        await this._write(writer => writer.logActionStart({
            actionId: this.actionId,
            sessionId: getSessionId(),
            parentActionId: this.parent?.enabled ? this.parent.actionId : undefined,
            actionName: this._info.actionName,
            packageName: this._info.packageName,
            packageRegistry: this._info.packageRegistry,
            version: this._info.version
        }));
    }

    /** Final status: rolled back once anything was reverted, otherwise success or failure. */
    public async end(failed: boolean): Promise<void> {
        const status: ActionLogStatus = this._rolledBack ? 'B' : failed ? 'F' : 'S';
        let version: string | undefined;
        try {
            version = this._info.resolvedVersion?.();
        } catch {
            version = undefined;
        }
        await this._write(writer => writer.logActionEnd(this.actionId, status, version));
    }

    /** Role of a transport in this action, used by its events that don't name one. */
    public assignRole(trkorr: string, role: ActionLogTransportRole): void {
        if (!this._roles.has(trkorr)) {
            this._roles.set(trkorr, role);
        }
    }

    public async record(events: ActionLogEvent[]): Promise<void> {
        if (events.length === 0) {
            return;
        }
        const withRoles = events.map(event => ({ ...event, role: event.role || this._roles.get(event.trkorr) }));
        await this._write(writer => writer.logTransportEvents(this.actionId, withRoles));
    }

    /** Runs `fn` with this as the current action. */
    public run<T>(fn: () => Promise<T>): Promise<T> {
        return storage.run(this, fn);
    }

    /**
     * Runs the rollback of this action after it ended, e.g. a dependency install reverted by its parent:
     * its events are recorded under this action, which ends rolled back.
     */
    public async runRollback(fn: () => Promise<void>): Promise<void> {
        this.markRolledBack();
        try {
            await this.run(fn);
        } finally {
            await this.end(true);
        }
    }

    private async _write(write: (writer: ActionLogWriter) => Promise<void>): Promise<void> {
        if (this._disabled || !_writer) {
            return;
        }
        try {
            await write(_writer);
        } catch (error) {
            this._disabled = true;
            const reason = (error instanceof Error ? error.message : String(error)).trim().replace(/\.+$/, '');
            Logger.warning(`Could not write the TRM action log (transaction /ATRM/LOG): ${reason}. The action continues without it.`, { important: true });
        }
    }
}

const storage = new AsyncLocalStorage<ActionLogScope>();

/** The TRM action running in this async context, if any. */
export function currentActionLog(): ActionLogScope | undefined {
    return storage.getStore();
}

/** Creates the log of a new action, child of the current one, and records its start. */
export async function startActionLog(info: ActionLogInfo): Promise<ActionLogScope> {
    const scope = new ActionLogScope(info, currentActionLog());
    await scope.start();
    return scope;
}

/** Runs `fn` as a logged action: started before, ended (success, failure or rolled back) after. */
export async function runWithActionLog<T>(info: ActionLogInfo, fn: (scope: ActionLogScope) => Promise<T>): Promise<T> {
    const scope = await startActionLog(info);
    try {
        const result = await scope.run(() => fn(scope));
        await scope.end(false);
        return result;
    } catch (error) {
        await scope.end(true);
        throw error;
    }
}

/** Records an event of the current action on a transport. Never throws. */
export async function recordTransportEvent(trkorr: string, event: ActionLogTransportEvent, details?: { role?: ActionLogTransportRole, target?: string, retcode?: number }): Promise<void> {
    const scope = currentActionLog();
    if (!scope || !trkorr) {
        return;
    }
    await scope.record([{ trkorr, event, ...details }]);
}

/** Records the import of transports by the current action. Never throws. */
export async function recordTransportImports(target: string, results: { trkorr: string, rc: number }[]): Promise<void> {
    const scope = currentActionLog();
    if (!scope) {
        return;
    }
    await scope.record(results.map(result => ({ trkorr: result.trkorr, event: 'IMPORT', target, retcode: result.rc >= 0 ? result.rc : undefined })));
}

/** Assigns the role of a transport in the current action. */
export function assignTransportRole(trkorr: string, role: ActionLogTransportRole | undefined): void {
    if (role && trkorr) {
        currentActionLog()?.assignRole(trkorr, role);
    }
}

/** Marks the current action as rolled back. */
export function markActionRolledBack(): void {
    currentActionLog()?.markRolledBack();
}
