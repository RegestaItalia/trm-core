import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setSystemPackages: Step<FindDependenciesWorkflowContext> = {
    name: 'set-system-packages',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var systemPackages = context.parsedInput.systemPackages;
        if(systemPackages.length === 0){
            Logger.loading(`Reading system packages`, true);
            systemPackages = await SystemConnector.getInstalledPackages(true);
        }
        context.parsedInput.systemPackages = systemPackages;
    }
}