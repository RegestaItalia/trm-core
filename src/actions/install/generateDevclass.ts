import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";

export const generateDevclass: Step<InstallWorkflowContext> = {
    name: 'generate-devclass',
    run: async (context: InstallWorkflowContext): Promise<void> => {

    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        //delete devclass only if they were actually generated in the step
        /*Logger.loading(``);
        try {
        } catch (e) {
            Logger.info(`Unable to rollback`);
            Logger.error(e.toString(), true);
        }*/
    }
}