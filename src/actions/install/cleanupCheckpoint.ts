import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { deleteImportedEntries } from "./importBatch";

/**
 * Workflow step that changes nothing: its revert cleans up what the install itself changed.
 *
 * It runs right after `install-dependencies`, so a rollback cleans up the generated SAP packages
 * and namespace, and restores the package transport layers and hierarchy, before the dependencies
 * are rolled back (a dependency rollback may delete the namespace these packages are in).
 * Every restore is attempted; the first failure is thrown afterwards.
 */
export const cleanupCheckpoint: Step<InstallWorkflowContext> = {
    name: 'cleanup-checkpoint',
    run: async (): Promise<void> => {
        // Nothing to do: the step only orders the revert.
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.revert.cleanupImported && (
            context.revert.importStarted || context.revert.importedEntries.length > 0
            || context.revert.cleanupTransport || context.revert.namespace || context.revert.sapPackages.length > 0
        )) {
            await deleteImportedEntries(context);
        }
        if (context.revert.cleanupImported && !context.revert.cleanupSucceeded) {
            return;
        }

        let firstError: unknown;
        for (const layer of context.revert.packageTransportLayers || []) {
            try {
                await SystemConnector.setPackageTransportLayer(layer.devclass, layer.transportLayer);
            } catch (error) {
                firstError ||= error;
            }
        }
        for (const pkg of context.revert.packageHierarchy || []) {
            try {
                if (pkg.parentcl) {
                    await SystemConnector.setPackageSuperpackage(pkg.devclass, pkg.parentcl);
                } else {
                    await SystemConnector.clearPackageSuperpackage(pkg.devclass);
                }
            } catch (error) {
                firstError ||= error;
            }
        }
        if (firstError) {
            throw firstError;
        }
    }
}
