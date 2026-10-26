import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { isPackageApiUnsupported, logPackageApiUnsupported } from "../commons/utils";
import { deleteImportedEntries } from "./importBatch";

/** A restore the SAP package API can't run on this release is left to do by hand: it's not a rollback failure. */
function warnUnsupported(error: unknown, operation: string, manualStep: string): boolean {
    if (!isPackageApiUnsupported(error)) {
        return false;
    }
    logPackageApiUnsupported(operation, error);
    Logger.warning(`${manualStep}: the SAP package API is unsupported on ${SystemConnector.getDest()}.`, { important: true });
    return true;
}

/**
 * Workflow step that changes nothing: its revert cleans up what the install itself changed.
 *
 * It runs right after `install-dependencies`, so a rollback cleans up the generated SAP packages
 * and namespace, and restores the package transport layers and hierarchy, before the dependencies
 * are rolled back (a dependency rollback may delete the namespace these packages are in).
 * Every restore is attempted; the first failure is thrown afterwards. A restore the SAP package API
 * can't run on this release is a warning with what to restore by hand.
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
                if (!warnUnsupported(error, `Transport layer of ${layer.devclass}`, `Set transport layer ${layer.transportLayer || '(none)'} on SAP package ${layer.devclass} in SE21`)) {
                    firstError ||= error;
                }
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
                const manualStep = pkg.parentcl
                    ? `Set the superpackage of SAP package ${pkg.devclass} back to ${pkg.parentcl} in SE21`
                    : `Remove the superpackage of SAP package ${pkg.devclass} in SE21`;
                if (!warnUnsupported(error, `Superpackage of ${pkg.devclass}`, manualStep)) {
                    firstError ||= error;
                }
            }
        }
        if (firstError) {
            throw firstError;
        }
    }
}
