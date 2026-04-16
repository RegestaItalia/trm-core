import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { PostActivity } from "../../manifest";
import { TrmTransportIdentifier } from "../../transport";

/**
 * Execute post activities
 * 
 * 1- execute post activities
 * 
*/
export const executePostActivities: Step<InstallWorkflowContext> = {
    name: 'execute-post-activities',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.skipPostActivities) {
            Logger.log(`Skipping post activities (user input)`, true);
            return false;
        } else {
            if (context.runtime.remotePackageData.manifest.postActivities && context.runtime.remotePackageData.manifest.postActivities.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping post activities (none defined)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Execute post activities step', true);
        
        //1- execute post activities
        var counter: number = 0;
        for(var data of context.runtime.remotePackageData.manifest.postActivities){
            counter++;
            Logger.setPrefix(`(${counter}/${context.runtime.remotePackageData.manifest.postActivities.length}) `);
            try{
                if(Array.isArray(data.parameters)){
                    data.parameters.forEach(param => {
                        switch(param.value){
                            case '&INSTALL_WB_TRANSPORT&':
                                try{
                                    param.value = context.runtime.installData.transports.find(o => o.type === TrmTransportIdentifier.TADIR).transport.trkorr
                                }catch(x){
                                    throw new Error(`Cannot find install workbench transport number`);
                                }
                                break;
                            case '&INSTALL_CUST_TRANSPORT&':
                                try{
                                    param.value = context.runtime.installData.transports.find(o => o.type === TrmTransportIdentifier.CUST).transport.trkorr
                                }catch(x){
                                    throw new Error(`Cannot find install customizing transport number`);
                                }
                                break;
                        }
                    });
                }
                const postActivity = new PostActivity(data);
                await postActivity.execute();
            }catch(e){
                Logger.error(`Failed execution of post activity: ${e.message}`);
            }
            Logger.removePrefix();
        }
    }
}