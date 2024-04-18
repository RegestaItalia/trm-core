import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependencyWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setSystemPackages: Step<CheckPackageDependencyWorkflowContext> = {
    name: 'set-system-packages',
    filter: async (context: CheckPackageDependencyWorkflowContext): Promise<boolean> => {
        return context.parsedInput.dependencies.length > 0;
    },
    run: async (context: CheckPackageDependencyWorkflowContext): Promise<void> => {
        var systemPackages = context.rawInput.systemPackages || [];
        if(systemPackages.length === 0){
            Logger.loading(`Reading system packages`, true);
            systemPackages = await SystemConnector.getInstalledPackages(true);
        }
        context.parsedInput.systemPackages = systemPackages;
    }
}