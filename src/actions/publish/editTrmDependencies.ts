import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";


export const editTrmDependencies: Step<WorkflowContext> = {
    name: 'edit-trm-dependencies',
    filter: async (context: WorkflowContext): Promise<boolean> => {
        if(context.rawInput.skipEditDependencies){
            Logger.log(`Skip edit of TRM dependencies (input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: WorkflowContext): Promise<void> => {
        var editorValue = '[]';
        if(context.runtime.manifest.dependencies){
            editorValue = JSON.stringify(context.runtime.manifest.dependencies, null, 2);
        }
        const inq1 = await Inquirer.prompt([{
            message: `Manually edit dependencies?`,
            type: 'confirm',
            name: 'editDependencies',
            default: false
        }, {
            message: 'Editor dependencies',
            type: 'editor',
            name: 'dependencies',
            postfix: '.json',
            when: (hash) => {
                return hash.editDependencies
            },
            default: editorValue,
            validate: (input) => {
                try {
                    const parsedInput = JSON.parse(input);
                    if(Array.isArray(parsedInput)){
                        return true;
                    }else{
                        return 'Invalid array';
                    }
                } catch (e) {
                    return 'Invalid JSON';
                }
            }
        }]);
        if (inq1.dependencies) {
            Logger.log(`TRM dependencies have been manually edited: before -> ${JSON.stringify(context.runtime.manifest.dependencies)}, after -> ${inq1.dependencies}`, true);
            context.runtime.manifest.dependencies = JSON.parse(inq1.dependencies);
        } else {
            Logger.log(`TRM dependencies are not been manually edited`, true);
            context.runtime.manifest.dependencies = context.runtime.manifest.dependencies || [];
        }
    }
}