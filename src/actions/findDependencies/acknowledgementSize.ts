import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext } from ".";
import { Inquirer } from "../../inquirer";

export const acknowledgementSize: Step<FindDependenciesWorkflowContext> = {
    name: 'acknowledgement-size',
    filter: async (context: FindDependenciesWorkflowContext): Promise<boolean> => {
        if(context.parsedInput.tadir.length > 50){
            return true;
        }else{
            return false;
        }
    },
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        const size = context.parsedInput.tadir.length;
        const inq1 = await Inquirer.prompt({
            type: 'confirm',
            name: 'continueDependency',
            default: true,
            message: `A total of ${size} objects will be analyzed in order to find dependencies, and it may take a long time. Continue?`
        });
        if(!inq1.continueDependency){
            throw new Error(`Process aborted by user.`);
        }
    }
}