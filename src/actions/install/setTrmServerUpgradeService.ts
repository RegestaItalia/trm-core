import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { TRM_SERVER_PACKAGE_NAME } from "../../systemConnector";
import { RegistryType } from "../../registry";
import { TrmServerUpgrade } from "../../commons";

/**
 * If upgrading trm-server, set service (used for backwards compatibility)
 * 
 * 1- set service
 * 
*/
export const setTrmServerUpgradeService: Step<InstallWorkflowContext> = {
    name: 'set-trm-server-upgrade-service',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.packageData.name === TRM_SERVER_PACKAGE_NAME && context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC){
            return true;
        }else{
            Logger.log(`Skipping TRM Server upgrade service (not upgrading trm-server)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Set TRM Server upgrade service step', true);

        //1- set service
        TrmServerUpgrade.createInstance(
            context.rawInput.contextData.systemPackages.find(o => o.compareName(TRM_SERVER_PACKAGE_NAME)).manifest.get().version,
            context.runtime.remotePackageData.manifest.version
        );
    }
}