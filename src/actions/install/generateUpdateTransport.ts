import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { SystemConnector } from "../../systemConnector";
import { cleanupInstalledPackage, CustomizingRow, deleteCleanupStagingPackages, forwardDeletionTransport, isDeletionForwardable, revertInstalledPackageCleanup } from "../commons/utils";
import { PackageHierarchy } from "../../commons";

export { deleteTemporaryCleanupPackages } from "../commons/utils";

function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [pkg.devclass, ...pkg.sub.flatMap(flattenDevclasses)];
}

/** Table content of the customizing transports the upgrade imports, from their transport entries. */
function incomingCustomizingRows(context: InstallWorkflowContext): CustomizingRow[] {
    return (context.runtime.transports?.cust || []).flatMap(cust => {
        const entries: any = cust.binaries?.entries || {};
        // Registry entries are camel-cased: E071K becomes e071K.
        const keys: CustomizingRow[] = (entries.e071K || entries.e071k || []).map((key: any) => ({
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
 * The cleanup itself is shared with the uninstall action, which removes the installed
 * release without an incoming one.
*/
export const generateUpdateTransport: Step<InstallWorkflowContext> = {
    name: 'generate-update-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.selfUpdate) {
            // The installed release runs this install: its objects are cleaned up after the import
            Logger.log(`Upgrade cleanup of ${context.rawInput.packageData.name} runs after the import`, true);
            return false;
        }
        //a local (.trm) upgrade generates its deletion transport through the registry the artifact was published to
        if (context.runtime.update) {
            return true;
        } else {
            Logger.log(`Skipping generate deletion transport (first install?)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        await cleanupPreviousRelease(context, false);
    },
    revert: revertUpdateCleanup
};

/**
 * Workflow step that cleans up an upgrade of trm-server or trm-rest, last in the install (see
 * {@link generateUpdateTransport}); every other package is cleaned up before its import. The installed
 * release runs the install: deleting its objects first would remove the APIs the install still calls.
 * Once the upgrade is complete, only the objects the new release doesn't ship are deleted, with its APIs.
 */
export const generatePostImportUpdateTransport: Step<InstallWorkflowContext> = {
    name: 'generate-post-import-update-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => !!context.runtime.selfUpdate,
    run: async (context: InstallWorkflowContext): Promise<void> => {
        // The new release is installed: a failed cleanup leaves objects of the previous one, it doesn't undo the install
        try {
            await cleanupPreviousRelease(context, true);
        } catch (error) {
            let revertError: unknown;
            if (!context.revert.deleImportStarted) {
                try {
                    await revertUpdateCleanup(context);
                } catch (e) {
                    revertError = e;
                }
            }
            const version = context.runtime.update.manifest.get().version;
            Logger.warning(`Cleanup of ${context.rawInput.packageData.name} ${version} failed: ${error instanceof Error ? error.message : String(error)}`, { important: true });
            if (revertError) {
                Logger.warning(`Cleanup could not be undone either: ${revertError instanceof Error ? revertError.message : String(revertError)}`, { important: true });
            }
            Logger.warning(`${context.rawInput.packageData.name} ${context.runtime.package.data.manifest.version} is installed. Objects of ${version} it doesn't ship may be left on ${SystemConnector.getDest()}: delete them manually.`, { important: true });
            return;
        }
        // The landscape transport is already released: the deletion follows it to the target
        const targetSystem = context.rawInput.installData?.landscapeTransport?.targetSystem;
        if (targetSystem && context.output?.transport && isDeletionForwardable(context)) {
            try {
                await forwardDeletionTransport(context, targetSystem);
            } catch (error) {
                Logger.warning(`Deletion transport ${context.revert.dele.trkorr} could not be added to the ${targetSystem} import queue: ${error instanceof Error ? error.message : String(error)}. Add it in STMS after ${context.output.transport.trkorr}.`, { important: true });
            }
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        // The imported release stays (see import-batch): objects it doesn't ship stay deleted too.
        // A cleanup that stopped before its deletion transport is undone.
        if (context.revert.deleImportStarted) {
            Logger.log(`Keeping the cleanup of ${context.rawInput.packageData.name}: its imported release is not rolled back`, true);
            return;
        }
        await revertUpdateCleanup(context);
    }
};

async function cleanupPreviousRelease(context: InstallWorkflowContext, incomingImported: boolean): Promise<void> {
    if (!context.runtime.stopWarningShown) {
        context.runtime.stopWarningShown = true;
        stopWarning('install');
    }
    // The cleanup deletes and re-imports the root package: read it now, so the import can put it back
    // under the superpackage it has on this system (prepare-devc reads it after the cleanup).
    if (!incomingImported && context.rawInput.installData?.installDevclass?.keepOriginal && !context.runtime.rootDevclassBeforeImport) {
        context.runtime.rootDevclassBeforeImport = await SystemConnector.getDevclass(context.runtime.package.hierarchy.devclass);
    }
    // Read the target lazily: a failure reading the previous release must still be tracked first.
    const installDevclass = context.rawInput.installData?.installDevclass;
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
        incomingImported,
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
}

async function revertUpdateCleanup(context: InstallWorkflowContext): Promise<void> {
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
