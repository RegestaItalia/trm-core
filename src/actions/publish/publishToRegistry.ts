import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmArtifact } from "../../trmPackage";
import { Manifest } from "../../manifest";

/**
 * Publish to registry
 * 
 * 1- generate TRM artifact
 * 
 * 2- publish to registry
 * 
*/
export const publishToRegistry: Step<PublishWorkflowContext> = {
    name: 'publish-to-registry',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Publish to registry step', true);

        //1- generate TRM artifact
        Logger.loading(`Creating TRM package...`);
        context.runtime.trmPackage.artifact = await TrmArtifact.create({
            transports: context.runtime.systemData.releasedTransports,
            manifest: new Manifest(context.runtime.trmPackage.manifest)
        });
        
        //2- publish to registry
        Logger.loading(`Publishing...`);
        await context.runtime.trmPackage.package.publish({
            artifact: context.runtime.trmPackage.artifact,
            readme: context.rawInput.publishData.readme
        });
    }
}