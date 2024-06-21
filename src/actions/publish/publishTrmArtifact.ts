import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";

export const publishTrmArtifact: Step<PublishWorkflowContext> = {
    name: 'publish-trm-artifact',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.loading(`Publishing TRM Artifact...`);
        await context.runtime.trmPackage.publish({
            artifact: context.runtime.artifact,
            readme: context.parsedInput.readme
        });
    }
}