import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setSystemPackages: Step<InstallWorkflowContext> = {
    name: 'set-system-packages',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var systemPackages = context.parsedInput.systemPackages;
        if(systemPackages.length === 0){
            Logger.loading(`Reading system data...`);
            systemPackages = await SystemConnector.getInstalledPackages(true);
        }
        context.parsedInput.systemPackages = systemPackages;
    }
}