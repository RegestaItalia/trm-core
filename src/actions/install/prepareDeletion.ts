import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { TransportImportError } from "../../transport/TransportImportError";
import { DeletionKey } from "../../registry";
import { deletePlannedTemporaryPackages, generateCleanupDeletions, revertCleanupDeletions, TRM_FIXED_TADIR_TRANSPORTS, withScopedPrefix } from "../commons/utils";
import { customizingRows, incomingRegistryTransports } from "./planUpdateCleanup";

/** Only transports stored in the registry (`TRMK…`) can be subtracted by it. */
const REGISTRY_TRANSPORT = /^TRMK[0-9A-Z]{6}$/;

/**
 * What the incoming release ships, never deleted: its registry transports, or (for transports the registry
 * doesn't store, like the fixed trm-server/trm-rest TADIR transport or a local artifact's) their objects and keys.
 */
function incoming(context: InstallWorkflowContext) {
    const packageName = context.runtime.package.data.manifest?.name || context.rawInput.packageData.name;
    // The backups also hold the objects of the incoming release already on the system (its SAP packages too):
    // every repository transport it ships is subtracted, not only the TADIR one
    const subtract: string[] = [];
    const objects: { pgmid: string, object: string, objName: string }[] = [];
    for (const transport of [context.runtime.transports.tadir, context.runtime.transports.devc, context.runtime.transports.lang]) {
        const binaries = transport?.binaries;
        if (!binaries?.trkorr) {
            continue;
        }
        if (REGISTRY_TRANSPORT.test(binaries.trkorr) && TRM_FIXED_TADIR_TRANSPORTS[packageName] !== binaries.trkorr) {
            subtract.push(binaries.trkorr);
        } else {
            const entries = binaries.entries?.tadir || (binaries.entries?.e071 || []).filter(o => o.pgmid.trim().toUpperCase() === 'R3TR');
            objects.push(...entries.map(o => ({ pgmid: o.pgmid, object: o.object, objName: o.objName })));
        }
    }
    const custTrkorrs = incomingRegistryTransports(context, TrmTransportIdentifier.CUST);
    const custSubtractable = custTrkorrs.every(trkorr => REGISTRY_TRANSPORT.test(trkorr));
    const custKeys: DeletionKey[] = (context.runtime.transports.cust || []).flatMap(cust => customizingRows(cust.binaries?.entries))
        .filter(row => row.tabkey !== undefined).map(row => ({ table: row.table, tabkey: row.tabkey }));
    return {
        tadir: {
            ...(subtract.length > 0 ? { subtract } : {}),
            ...(objects.length > 0 ? { objects } : {})
        },
        cust: custSubtractable ? { subtract: custTrkorrs } : { keys: custKeys }
    };
}

/**
 * Workflow step that generates the deletion transports of an upgrade, from the backups of prepare-backup:
 * what the installed release has and the incoming one doesn't ship (minus what was declined), as
 * `@X1@TRM (DELE)` dummies (one for objects, one for customizing).
 *
 * They are imported with the incoming release (import-batch) and copied into the landscape transport, so
 * the following systems get the same cleanup. Nothing to delete: the dummy is taken out of the queue.
 * When the registry can't generate them, the upgrade goes on and the leftovers are listed.
 */
export const prepareDeletion: Step<InstallWorkflowContext> = {
    name: 'prepare-deletion',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => !!context.runtime.cleanupPlan,
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const plan = context.runtime.cleanupPlan;
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Upgrade cleanup) `, async () => {
            await generateCleanupDeletions(context, plan, {
                requireDeletion: false,
                incoming: incoming(context)
            });
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        await revertCleanupDeletions(context);
    }
};

/** Generated deletion transports of the upgrade, objects first. */
export function cleanupDeletions(context: InstallWorkflowContext): Transport[] {
    return [context.runtime.deletions?.tadir, context.runtime.deletions?.cust].filter(Boolean);
}

/**
 * Workflow step that imports the deletion transports of a trm-server/trm-rest upgrade, once the incoming
 * release is imported: the installed release runs the install, and only the objects the new release doesn't
 * ship are deleted. A failure leaves objects of the previous release, it doesn't undo the upgrade.
 */
export const importUpdateDeletion: Step<InstallWorkflowContext> = {
    name: 'import-update-deletion',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => !!context.runtime.selfUpdate && !!context.runtime.cleanupPlan,
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const plan = context.runtime.cleanupPlan;
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Upgrade cleanup) `, async () => {
            for (const deletion of cleanupDeletions(context)) {
                try {
                    Logger.loading(`Importing ${deletion.trkorr}...`);
                    const rc = await deletion.import(false);
                    TransportImportError.assert(deletion.trkorr, rc, `Import of deletion transport`, deletion.lastImportMessage, context.ignoreImportErrors);
                } catch (error) {
                    Logger.warning(`Cleanup of ${context.rawInput.packageData.name} ${plan.installedVersion} failed: ${error instanceof Error ? error.message : String(error)}`, { important: true });
                    Logger.warning(`${context.rawInput.packageData.name} ${context.runtime.package.data.manifest.version} is installed. Objects of ${plan.installedVersion} it doesn't ship may be left: check ${deletion.trkorr} in STMS.`, { important: true });
                    // not copied into the landscape transport: the following systems keep them as well
                    context.runtime.deletions = { ...context.runtime.deletions, [deletion === context.runtime.deletions.tadir ? 'tadir' : 'cust']: undefined };
                }
            }
            await deletePlannedTemporaryPackages(context, plan);
        });
    }
};
