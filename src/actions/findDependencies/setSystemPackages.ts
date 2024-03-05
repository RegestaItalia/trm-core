import { Step } from "@sammarks/workflow";
import { FindDependenciesPublishWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setSystemPackages: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'set-system-packages',
    filter: async (context: FindDependenciesPublishWorkflowContext): Promise<boolean> => {
        return context.rawInput.deepCheck;
    },
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        var systemPackages = context.rawInput.systemPackages || [];
        if(systemPackages.length === 0){
            Logger.loading(`Reading system packages`, true);
            systemPackages = await SystemConnector.getInstalledPackages(true);
        }
        context.parsedInput.systemPackages = systemPackages;
    }
}