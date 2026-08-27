import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { PostActivity } from "../../manifest";

/**
 * Workflow step that executes post-install activities declared by the package manifest.
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
            if (context.runtime.package.data.manifest.postActivities && context.runtime.package.data.manifest.postActivities.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping post activities (none defined)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- execute post activities
        var counter: number = 0;
        for(var data of context.runtime.package.data.manifest.postActivities){
            counter++;
            Logger.setPrefix(`(${counter}/${context.runtime.package.data.manifest.postActivities.length}) `);
            try{
                if(Array.isArray(data.parameters)){
                    data.parameters.forEach(param => {
                        switch(param.value){
                            case '&LANDSCAPE_TRANSPORT&':
                                param.value = context.output.transport?.trkorr;
                                break;
                            default:
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
