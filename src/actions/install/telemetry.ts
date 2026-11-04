import { Logger } from "trm-commons";
import { TELEMETRY_SCHEMA_VERSION, TelemetryFailureReason, TelemetryInstallEvent, TelemetryTransport, TelemetryTransportType } from "trm-registry-types";
import type { E071 } from "../../client";
import { resolveCoreVersion } from "../../commons/resolveCoreVersion";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { TransportImportError } from "../../transport/TransportImportError";
import type { InstallWorkflowContext } from ".";

const DEPENDENCY_STEPS = ['check-dependencies', 'check-dependency-cycles', 'install-dependencies'];

/** The outermost failed step and the root cause of a (nested, possibly reverted) workflow error. */
function unwrapWorkflowError(error: any): { step?: string, cause: any } {
    // a failed rollback wraps the step failure
    let current = error?.originalWorkflowError || error;
    const step = typeof current?.stepName === 'string' ? current.stepName : undefined;
    while (typeof current?.stepName === 'string' && 'originalException' in current) {
        current = current.originalException;
    }
    return { step, cause: current };
}

function failureOf(context: InstallWorkflowContext, error: unknown): TelemetryInstallEvent['failure'] {
    const { step, cause } = unwrapWorkflowError(error);
    let reason: TelemetryFailureReason = 'other';
    let rc: number | undefined;
    if (cause instanceof TransportImportError) {
        reason = 'import';
        rc = cause.rc;
    } else if (step === 'check-engines') {
        reason = context.runtime?.missingSapEntries > 0 ? 'sapEntries' : 'engines';
    } else if (DEPENDENCY_STEPS.includes(step)) {
        reason = 'dependencies';
    }
    return { reason, step: step && /^[a-z0-9-]{1,64}$/.test(step) ? step : undefined, rc };
}

/** Number of transport entries per object type: object names are never sent. */
function countObjects(e071?: E071[]): Record<string, number> | undefined {
    if (!e071?.length) {
        return undefined;
    }
    const counts: Record<string, number> = {};
    for (const entry of e071) {
        const type = entry.object?.trim().toUpperCase();
        if (type && /^[A-Z0-9_]{1,4}$/.test(type)) {
            counts[type] = (counts[type] || 0) + 1;
        }
    }
    return counts;
}

function transportsOf(context: InstallWorkflowContext): TelemetryTransport[] {
    const transports = context.runtime?.transports;
    if (!transports) {
        return [];
    }
    const returnCodes = context.runtime.importTelemetry?.returnCodes || {};
    const entry = (type: TelemetryTransportType, instance?: Transport, e071?: E071[]): TelemetryTransport => {
        const rc = instance ? returnCodes[instance.trkorr] : undefined;
        const transport: TelemetryTransport = { type };
        if (typeof rc === 'number') transport.rc = rc;
        const objects = countObjects(e071);
        if (objects) transport.objects = objects;
        return transport;
    };
    const result: TelemetryTransport[] = [];
    for (const [type, runtime] of [['DEVC', transports.devc], ['TADIR', transports.tadir], ['LANG', transports.lang]] as const) {
        if (runtime?.binaries || runtime?.instance) {
            result.push(entry(type, runtime.instance, runtime.binaries?.entries?.e071));
        }
    }
    for (const cust of transports.cust || []) {
        result.push(entry('CUST', cust.instance, cust.binaries?.entries?.e071));
    }
    for (const deletion of [context.runtime.deletions?.tadir, context.runtime.deletions?.cust]) {
        if (deletion) {
            result.push(entry('DELETION', deletion));
        }
    }
    return result;
}

/** Builds the install telemetry event; `undefined` when the release was never resolved. */
export async function buildInstallTelemetry(context: InstallWorkflowContext, startedAt: number, error?: unknown): Promise<TelemetryInstallEvent | undefined> {
    const manifest = context.runtime?.package?.data?.manifest;
    if (!manifest?.name || !manifest?.version) {
        return undefined;
    }
    const event: TelemetryInstallEvent = {
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        event: 'install',
        package: { name: manifest.name, version: manifest.version },
        outcome: error ? 'failure' : 'success',
        durationMs: Math.max(0, Date.now() - startedAt),
        system: await SystemConnector.getSystemInfo(),
        client: { core: resolveCoreVersion(context.rawInput.contextData?.coreVersion) }
    };
    const previousVersion = context.runtime.update?.manifest?.get()?.version;
    if (previousVersion) {
        event.package.previousVersion = previousVersion;
    }
    if (error) {
        event.failure = failureOf(context, error);
    }
    if (typeof context.runtime.importTelemetry?.durationMs === 'number') {
        event.importDurationMs = context.runtime.importTelemetry.durationMs;
    }
    const transports = transportsOf(context);
    if (transports.length > 0) {
        event.transports = transports;
    }
    return event;
}

/**
 * Sends the opt-in install telemetry to the registry the package is installed from.
 * Transparent to the user: it never throws and only logs in debug.
 */
export async function sendInstallTelemetry(context: InstallWorkflowContext, startedAt: number, error?: unknown): Promise<void> {
    if (!context.rawInput.contextData?.telemetry || context.rawInput.contextData?.simulate) {
        return;
    }
    try {
        const event = await buildInstallTelemetry(context, startedAt, error);
        const registry = context.runtime?.installRegistry || context.rawInput.packageData.registry;
        if (!event || typeof registry?.telemetry !== 'function') {
            return;
        }
        await registry.telemetry(event);
    } catch (e) {
        Logger.log(`Install telemetry not sent: ${e instanceof Error ? e.message : String(e)}`, true);
    }
}
