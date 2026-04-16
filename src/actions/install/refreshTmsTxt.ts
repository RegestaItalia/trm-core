import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";

/**
 * Refresh TMS queue texts
 * 
 * 1- refresh tms texts
 * 
*/
export const refreshTmsTxt: Step<InstallWorkflowContext> = {
    name: 'refresh-tms-txt',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.generatedData.tmsTxtRefresh.length > 0){
            return true;
        }else{
            Logger.log(`Skipping TMS refresh`, true);
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