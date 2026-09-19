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
        }
        if (context.runtime.package.data.manifest.postActivities && context.runtime.package.data.manifest.postActivities.length > 0) {
            return true;
        }
        Logger.log(`Skipping post activities (none defined)`, true);
        return false;
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- execute post activities
        let counter = 0;
        for (const data of context.runtime.package.data.manifest.postActivities) {
            counter++;
            Logger.setPrefix(`(${counter}/${context.runtime.package.data.manifest.postActivities.length}) `);
            try{
                const activity = {
                    ...data,
                    parameters: Array.isArray(data.parameters)
                        ? data.parameters.map(param => ({
                            ...param,
                            value: param.value === '&LANDSCAPE_TRANSPORT&'
                                ? context.output.transport?.trkorr
                                : param.value
                        }))
                        : data.parameters
                };
                const postActivity = new PostActivity(activity);
                await postActivity.execute();
            } catch (e) {
                Logger.error(`Failed execution of post activity: ${e.message}`);
                throw e;
            } finally {
                Logger.removePrefix();
            }
        }
    }
}
