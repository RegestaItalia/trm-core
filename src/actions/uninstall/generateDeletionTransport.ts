import { Step } from "@simonegaffurini/sammarksworkflow";
import { UninstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { cleanupInstalledPackage, deleteCleanupStagingPackages, revertInstalledPackageCleanup } from "../commons/utils";

/**
 * Workflow step that removes every object of the installed release through a deletion transport.
 * 
 * It's the same cleanup performed by install when upgrading a package (see `generateUpdateTransport`),
 * where nothing is kept because there's no incoming release.
 * 
*/
export const generateDeletionTransport: Step<UninstallWorkflowContext> = {
    name: 'generate-deletion-transport',
    run: async (context: UninstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('uninstall');
        }
        await cleanupInstalledPackage(context, {
            incomingObjects: [],
            keptDevclasses: [],
            prefix: `(${Transport.getTransportIcon()}  Uninstall) `,
            actionName: 'Uninstall',
            requireDeletion: true
        });
        context.output.transport = context.runtime.dele;
    },
    revert: async (context: UninstallWorkflowContext): Promise<void> => {
        // Objects might still be assigned to a staging package if restoring failed:
        // only delete staging packages after a complete restore.
        await revertInstalledPackageCleanup(context);
        await deleteCleanupStagingPackages(context);
    }
}
