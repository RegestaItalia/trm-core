import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
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
        //1- generate TRM artifact
        Logger.loading(`Creating TRM package...`);
        context.output.trmArtifact = await TrmArtifact.create({
            transports: context.runtime.aggregatedTransports,
            manifest: new Manifest(context.runtime.manifest),
            sourceCode: context.runtime.abapGit.sourceCode
        });
        
        //2- publish to registry
        if(context.rawInput.packageData.tags.length > 0){
            Logger.info(`Publishing with tag${context.rawInput.packageData.tags.length === 1 ? '': 's'}: ${context.rawInput.packageData.tags.join(', ')}`);
        }
        Logger.loading(`Publishing...`);
        await context.output.trmPackage.publish({
            artifact: context.output.trmArtifact,
            readme: context.rawInput.publishData.readme,
            tags: context.rawInput.packageData.tags,
            changelog: context.rawInput.publishData.changelog,
            retainedCustomizing: context.runtime.customizing.retained.map(o => o.trkorr)
        });
    }
}