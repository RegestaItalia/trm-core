import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setSystemPackages: Step<InstallWorkflowContext> = {
    name: 'set-system-packages',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var systemPackages = context.rawInput.systemPackages || [];
        if(systemPackages.length === 0){
            Logger.loading(`Reading system packages`, true);
            systemPackages = await SystemConnector.getInstalledPackages(true);
        }
        context.parsedInput.systemPackages = systemPackages;
    }
}