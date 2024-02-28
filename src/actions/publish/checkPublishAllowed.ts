import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";

export const checkPublishAllowed: Step<WorkflowContext> = {
    name: 'check-publish-allowed',
    run: async (context: WorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;

        //create a dummy TrmPackage, just to check if it can be published
        Logger.loading(`Checking publish authorization...`);
        const oDummyTrmPackage = context.runtime.dummyPackage;
        var publishAllowed = true;
        try {
            publishAllowed = await oDummyTrmPackage.canPublishReleases();
        } catch (e) {
            //if this check gives an error, catch and try to publish anyway -> this might mean package not in registry so we're allowed
            //if it's an actual error, it will appear later on anyway
            //remember to give error code 404 if no package exists but always return the user authorizations
        }
        if (!publishAllowed) {
            throw new Error(`You are not not authorized to publish "${packageName}" releases.`);
        } else {
            Logger.success(`Package check successful.`);
        }
    }
}