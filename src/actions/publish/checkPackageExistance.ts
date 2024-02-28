import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";

export const checkPackageExistance: Step<WorkflowContext> = {
    name: 'check-package-existance',
    run: async (context: WorkflowContext): Promise<void> => {
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