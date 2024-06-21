import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";

export const checkPackageExistance: Step<PublishWorkflowContext> = {
    name: 'check-package-existance',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        Logger.loading(`Checking package "${packageName}"...`);
        if (await context.runtime.dummyPackage.exists()) {
            context.runtime.packageExistsOnRegistry = true;
        }else{
            Logger.info(`First time publishing "${context.parsedInput.packageName}". Congratulations!`);
            context.runtime.packageExistsOnRegistry = false;
        }
    }
}