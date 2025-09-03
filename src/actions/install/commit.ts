import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { RFCSystemConnector, SystemConnector } from "../../systemConnector";

/**
 * This step is only used with RFC connections: commit
 * 
 * 1- Close and re open connection
 * 
*/
export const commit: Step<InstallWorkflowContext> = {
    name: 'commit',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(SystemConnector.systemConnector instanceof RFCSystemConnector){
            return true;
        }else{
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Commit (RFC Connection) step', true);

        //1- Close and re open connection
        Logger.loading(`Closing rfc connection...`, true);
        await (SystemConnector.systemConnector as RFCSystemConnector).closeConnection();
        Logger.loading(`Opening rfc connection...`, true);
        await (SystemConnector.systemConnector as RFCSystemConnector).connect(true);
        Logger.success(`Commit OK`, true);
    }
}