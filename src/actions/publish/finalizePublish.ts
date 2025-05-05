import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { createHash } from "crypto";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

/**
 * Finalize publish
 * 
 * 1- add to system source transports
 * 
 * 2- save integrity on system
 * 
*/
export const finalizePublish: Step<PublishWorkflowContext> = {
    name: 'finalize-publish',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Finalize publish step', true);
        try{
            Logger.loading(`Finalizing...`);

            //1- add to system source transports
            await SystemConnector.addSrcTrkorr(context.runtime.systemData.tadirTransport.trkorr);
            
            //2- save integrity on system
            Logger.log(`Generating SHA512`, true);
            const integrity = createHash("sha512").update(context.runtime.trmPackage.artifact.binary).digest("hex");
            Logger.log(`SHA512: ${integrity}`, true);
            await SystemConnector.setPackageIntegrity({
                package_name: context.rawInput.packageData.name,
                package_registry: context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : context.rawInput.packageData.registry.endpoint,
                integrity
            });
        }catch(e){
            Logger.error(`An error occurred during publish finalize. The package has been published, however TRM on ${SystemConnector.getDest()} migh be inconsistent.`);
            Logger.error(e.toString(), true);
        }
    }
}