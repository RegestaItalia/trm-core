import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";

/**
 * Refresh TMS queue texts (only when transports are migrated)
 * 
 * 1- refresh tms texts
 * 
*/
export const refreshTmsTxt: Step<InstallWorkflowContext> = {
    name: 'refresh-tms-txt',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.generatedData.tmsTxtRefresh.length > 0){
            Logger.log(`Skipping import LANG transport (user input)`, true);
            return true;
        }else{
            Logger.log(`Skipping TMS refresh (no transports migrated)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Refresh TMS txt step', true);

        //1- refresh tms texts
        for(const transport of context.runtime.generatedData.tmsTxtRefresh){
            Logger.loading(`Updating TMS buffer ${transport.trkorr}...`);
            await transport.refreshTmsTxt();
        }
    }
}