import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

/**
 * Set package integrity
 * 
 * 1- set package integrity
 * 
*/
export const setPackageIntegrity: Step<InstallWorkflowContext> = {
    name: 'set-package-integrity',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Set package integrity step', true);

        //1- set package integrity
        Logger.loading(`Finalizing install...`);
        const packageRegistry = context.runtime.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : context.runtime.registry.endpoint;
        await SystemConnector.setPackageIntegrity({
            package_name: context.rawInput.packageData.name,
            package_registry: packageRegistry,
            integrity: context.runtime.remotePackageData.data.checksum
        });
    }
}