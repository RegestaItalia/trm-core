import { Step } from "@simonegaffurini/sammarksworkflow";
import { DeleteWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Workflow step that removes the deleted package from the target system's TRM package table.
 * 
 * Removes the record in TRM packages table, its install devclass mappings and install transports
 * 
*/
export const removePackageData: Step<DeleteWorkflowContext> = {
    name: 'remove-package-data',
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        // init reads the record before anything is deleted: never skip its removal.
        const snapshot = context.runtime.update.getMetadataSnapshot();
        if (!snapshot) {
            throw new Error(`TRM packages table record of ${context.runtime.update.packageName} is missing: it can't be removed.`);
        }
        Logger.loading(`Updating TRM data...`);
        context.revert.metadataPreviousPackageRow = snapshot;
        // Mark before the mutating await: SAP may commit the removal and still
        // fail while returning the response.
        context.revert.metadataRemoveStarted = true;
        await SystemConnector.restoreInstallMetadata({
            package: context.revert.metadataPreviousPackageRow,
            packageExists: false,
            installDevc: [],
            installTr: []
        });
        Logger.success(`${context.runtime.update.packageName} deleted from ${SystemConnector.getDest()}.`);
    },
    revert: async (context: DeleteWorkflowContext): Promise<void> => {
        if (!context.revert.metadataRemoveStarted) {
            return;
        }
        const previousRow = context.revert.metadataPreviousPackageRow;
        await SystemConnector.restoreInstallMetadata({
            package: previousRow,
            packageExists: true,
            installDevc: context.runtime.previousInstallPackages.map(replacement => ({
                package_name: previousRow.package_name,
                package_registry: previousRow.package_registry,
                original_devclass: replacement.originalDevclass,
                install_devclass: replacement.installDevclass
            })),
            installTr: (context.runtime.previousInstallTransports || []).map(transport => ({
                package_name: previousRow.package_name,
                package_registry: previousRow.package_registry,
                trkorr: transport.trkorr,
                trm_type: transport.trmType
            }))
        });
    }
}
