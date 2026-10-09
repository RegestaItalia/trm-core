import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { cleanupInstalledPackage, CustomizingRow, deleteCleanupStagingPackages, revertInstalledPackageCleanup } from "../commons/utils";
import { PackageHierarchy } from "../../commons";

export { deleteTemporaryCleanupPackages } from "../commons/utils";

function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [pkg.devclass, ...pkg.sub.flatMap(flattenDevclasses)];
}

/** Table content of the customizing transports the upgrade imports, from their transport entries. */
function incomingCustomizingRows(context: InstallWorkflowContext): CustomizingRow[] {
    return (context.runtime.transports?.cust || []).flatMap(cust => {
        const entries: any = cust.binaries?.entries || {};
        const keys: CustomizingRow[] = (entries.e071k || []).map((key: any) => ({
            table: (key.objname || key.mastername || '').trim(),
            tabkey: (key.tabkey || '').trim()
        }));
        const wholeTables: CustomizingRow[] = (entries.e071 || [])
            .filter((o: any) => (o.object || '').trim().toUpperCase() === 'TABU' && (o.objfunc || '').trim().toUpperCase() !== 'K')
            .map((o: any) => ({ table: (o.objName || '').trim() }));
        return [...keys, ...wholeTables];
    });
}

/**
 * Whether an upgrade keeps the customizing of the installed release: customizing of the incoming
 * release is skipped (noCust) or one of its transports was not imported. Deleting the installed
 * rows would then leave them missing.
 */
export function keepsInstalledCustomizing(context: InstallWorkflowContext): boolean {
    return !!context.rawInput.installData?.import?.noCust || (context.runtime.skippedCust || []).length > 0;
}

/**
 * Workflow step that creates a transport for objects removed by an upgrade.
 * It's necessary when:
 *   - upgrading/downgrading a package: to ensure old entries are cleaned up
 *   - sap packages were changes after upgrade/downgrade: to ensure empty packages are cleaned up
 * For these reasons, it's not generated on first install.
 *
 * The cleanup itself is shared with the delete action, which removes the installed
 * release without an incoming one.
*/
export const generateUpdateTransport: Step<InstallWorkflowContext> = {
    name: 'generate-update-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        //a local (.trm) upgrade generates its deletion transport through the registry the artifact was published to
        if (context.runtime.update) {
            return true;
        } else {
            Logger.log(`Skipping generate deletion transport (first install?)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }
        // Read the target lazily: a failure reading the previous release must still be tracked first.
        const installDevclass = context.rawInput.installData?.installDevclass;
        const importData = context.rawInput.installData?.import;
        const keepCustomizing = keepsInstalledCustomizing(context);
        if (keepCustomizing) {
            const skipped = context.runtime.skippedCust || [];
            Logger.warning(`Customizing transports are skipped${skipped.length > 0 ? ` (${skipped.join(', ')})` : ''}: the customizing of the installed release is kept.`, { important: true });
        }
        await cleanupInstalledPackage(context, {
            get incomingObjects() {
                return context.runtime.transports.tadir.binaries.entries.tadir || [];
            },
            get keptDevclasses() {
                return installDevclass.keepOriginal
                    ? flattenDevclasses(context.runtime.package.hierarchy)
                    : installDevclass.replacements.map(replacement => replacement.installDevclass);
            },
            prefix: `(${Transport.getTransportIcon()}  Upgrade cleanup) `,
            actionName: 'Update',
            requireDeletion: false,
            // Old customizing is deleted before the new customizing is imported: rows the new
            // release still ships are written again. Without that import, nothing would restore them.
            keepCustomizing,
            get incomingCustomizing() {
                return incomingCustomizingRows(context);
            }
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        // Rollback of the imported objects ran first: when it failed, they are still on the system
        // and the previous release must not be restored over them.
        const restore = !(context.revert.cleanupImported && !context.revert.cleanupSucceeded);
        await revertInstalledPackageCleanup(context, restore);
        // Objects might still be assigned to a staging package if restoring failed or was skipped:
        // only delete staging packages after a complete restore.
        if (restore) {
            await deleteCleanupStagingPackages(context);
        }
    }
}
