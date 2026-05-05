import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { RFCSystemConnector, SystemConnector } from "../../systemConnector";

/**
 * This step is only used with connections that are not stateless
 * 
 * 1- Close and re open connection
 * 
*/
export const commit: Step<InstallWorkflowContext> = {
    name: 'commit',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(!SystemConnector.isStateless()){
            return true;
        }else{
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Commit (connection not stateless) step', true);

        //1- Close and re open connection
        Logger.loading(`Closing connection...`, true);
        await SystemConnector.closeConnection();
        Logger.loading(`Opening connection...`, true);
        await SystemConnector.connect(true);
        Logger.success(`OK, continue`, true);
    }
}