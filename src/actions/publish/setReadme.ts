import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer";

/**
 * Set readme
 * 
 * 1- set readme
 * 
*/
export const setReadme: Step<PublishWorkflowContext> = {
    name: 'set-readme',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if(context.rawInput.publishData.readme !== undefined){
            Logger.log(`Skipping readme input (user provided)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set readme step', true);

        //1- set readme
        if(!context.rawInput.contextData.noInquirer){
            context.rawInput.publishData.readme = (await Inquirer.prompt([{
                message: 'Write readme?',
                type: 'confirm',
                name: 'editReadme',
                default: false
            }, {
                message: 'Write readme',
                type: 'editor',
                name: 'readme',
                postfix: '.md',
                when: (hash) => {
                    return hash.editReadme
                },
                default: `#${context.rawInput.packageData.name}`
            }])).readme;
        }
    }
}