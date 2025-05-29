import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { PostActivity } from "../../manifest";
import { TrmServerUpgrade } from "../../commons";

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
            if (context.runtime.remotePackageData.trmManifest.postActivities && context.runtime.remotePackageData.trmManifest.postActivities.length > 0) {
                if(TrmServerUpgrade.getInstance().executePostActivities()){
                    return true;
                }else{
                    Logger.warning(`Coudln't execute post activities! After trm-server upgrade, run them manually!`, true);
                    return false;
                }
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
        for(var data of context.runtime.remotePackageData.trmManifest.postActivities){
            counter++;
            Logger.setPrefix(`(${counter}/${context.runtime.remotePackageData.trmManifest.postActivities.length}) `);
            try{
                if(Array.isArray(data.parameters)){
                    data.parameters.forEach(param => {
                        switch(param.value){
                            case '&INSTALL_TRANSPORT&':
                                try{
                                    param.value = context.runtime.installData.transport.trkorr
                                }catch(x){
                                    throw new Error(`Cannot find install transport number`);
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