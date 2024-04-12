import { Step } from "@sammarks/workflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";


export const overwriteManifestValues: Step<PublishWorkflowContext> = {
    name: 'overwrite-manifest-values',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (!context.rawInput.overwriteManifestValues) {
            if (context.runtime.packageExistsOnRegistry) {
                return true;
            } else {
                Logger.log(`Skip owerwrite manifest values step because it's the first publish`, true);
                return false;
            }
        } else {
            Logger.log(`Skip owerwrite manifest values step (input)`, true);
            return false;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        try {
            const latestManifest = (await context.runtime.dummyPackage.fetchRemoteManifest('latest')).get();
            context.runtime.manifest.description = latestManifest.description;
            context.runtime.manifest.website = latestManifest.website;
            context.runtime.manifest.git = latestManifest.git;
            context.runtime.manifest.authors = latestManifest.authors;
            context.runtime.manifest.keywords = latestManifest.keywords;
            context.runtime.manifest.license = latestManifest.license;
        } catch (e) {
            Logger.error(e.toString(), true);
            Logger.warning(`Error during fetch of latest manifest, values won't be overwritten`);
        }
    }
}