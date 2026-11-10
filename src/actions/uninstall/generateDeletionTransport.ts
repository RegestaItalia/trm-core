import { Step } from "@simonegaffurini/sammarksworkflow";
import { UninstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { TransportImportError } from "../../transport/TransportImportError";
import {
    backupInstalledPackage, deleteCleanupStagingPackages, deletePlannedTemporaryPackages, generateCleanupDeletions,
    planInstalledPackageCleanup, restoreCleanupBackups, restoreTadirAssignments, revertCleanupDeletions, withScopedPrefix
} from "../commons/utils";

/**
 * Workflow step that removes every object of the installed release.
 *
 * It's the same cleanup performed by install when upgrading a package (see plan-update-cleanup and
 * prepare-deletion), where nothing is kept because there's no incoming release:
 * 1- plan the cleanup (questions are asked here)
 * 2- back up what is deleted (`@X1@TRM (BKP)` objects and customizing, kept in the import queue)
 * 3- generate the deletion transports from the backups (`@X1@TRM (DELE)`)
 * 4- import them
 */
export const generateDeletionTransport: Step<UninstallWorkflowContext> = {
    name: 'generate-deletion-transport',
    run: async (context: UninstallWorkflowContext): Promise<void> => {
        const prefix = `(${Transport.getTransportIcon()}  Uninstall) `;
        //1- plan the cleanup
        const plan = await planInstalledPackageCleanup(context, {
            incomingObjects: [],
            keptDevclasses: [],
            prefix,
            actionName: 'Uninstall'
        });
        context.runtime.cleanupPlan = plan;
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('uninstall');
        }
        await withScopedPrefix(prefix, async () => {
            //2- back up what is deleted
            await backupInstalledPackage(context, plan, [], { packageName: plan.packageName, version: plan.installedVersion }, { confirmKeptLocal: true });

            //3- generate the deletion transports
            await generateCleanupDeletions(context, plan, { requireDeletion: true });

            //4- import them
            const deletions = [context.runtime.deletions?.tadir, context.runtime.deletions?.cust].filter(Boolean);
            if (deletions.length === 0) {
                Logger.warning(`Nothing to delete for package ${context.rawInput.packageData.name}: manual cleanup of the installation might be necessary.`, { important: true });
            }
            for (const deletion of deletions) {
                Logger.loading(`Importing ${deletion.trkorr}...`);
                // Mark before the mutating await: the import may change objects and still fail.
                context.revert.deleImportStarted = true;
                const rc = await deletion.import(false);
                TransportImportError.assert(deletion.trkorr, rc, `Import of deletion transport`, deletion.lastImportMessage, context.ignoreImportErrors);
                Logger.success(`Transport ${deletion.trkorr} imported`, true);
            }
            await deletePlannedTemporaryPackages(context, plan);
            context.output.transport = context.runtime.deletions?.tadir || context.runtime.deletions?.cust;
            context.output.deletions = [...(context.runtime.nestedDeletions || []), ...deletions];
        });
    },
    revert: async (context: UninstallWorkflowContext): Promise<void> => {
        let firstError: unknown;
        // Deleted objects come back from the backups, which stay in the import queue.
        let restored = true;
        if (context.revert.deleImportStarted) {
            try {
                await restoreCleanupBackups(context);
            } catch (error) {
                restored = false;
                firstError = error;
            }
        } else {
            try {
                await restoreTadirAssignments(context.revert.cleanupOriginalTadir || []);
            } catch (error) {
                restored = false;
                firstError = error;
            }
        }
        try {
            await revertCleanupDeletions(context);
        } catch (error) {
            firstError ||= error;
        }
        // Objects might still be assigned to a staging package if restoring failed:
        // only delete staging packages after a complete restore.
        if (restored) {
            try {
                await deleteCleanupStagingPackages(context);
            } catch (error) {
                firstError ||= error;
            }
        }
        context.output.transport = undefined;
        context.output.deletions = undefined;
        if (firstError) {
            throw firstError;
        }
    }
}
