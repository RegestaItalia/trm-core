import { Step } from "@simonegaffurini/sammarksworkflow";
import { DeleteWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Workflow step that removes the deleted package from the target system's TRM package table.
 * 
 * Removes the record in TRM packages table and its install devclass mappings
 * 
*/
export const removePackageData: Step<DeleteWorkflowContext> = {
    name: 'remove-package-data',
    filter: async (context: DeleteWorkflowContext): Promise<boolean> => {
        if (context.runtime.update.getMetadataSnapshot()) {
            return true;
        } else {
            Logger.log(`Skipping remove package data (package not in TRM packages table)`, true);
            return false;
        }
    },
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        Logger.loading(`Updating TRM data...`);
        context.revert.metadataPreviousPackageRow = context.runtime.update.getMetadataSnapshot();
        // Mark before the mutating await: SAP may commit the removal and still
        // fail while returning the response.
        context.revert.metadataRemoveStarted = true;
        await SystemConnector.restoreInstallMetadata({
            package: context.revert.metadataPreviousPackageRow,
            packageExists: false,
            installDevc: []
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
            }))
        });
    }
}
