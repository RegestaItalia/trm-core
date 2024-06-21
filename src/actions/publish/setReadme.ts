import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer } from "../../inquirer/Inquirer";
import { Logger } from "../../logger";


export const setReadme: Step<PublishWorkflowContext> = {
    name: 'set-readme',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.silent) {
            Logger.log(`Skipping set readme (input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const inq1 = await Inquirer.prompt([{
            message: 'Write readme?',
            type: 'confirm',
            name: 'editReadme',
            default: false,
            when: !context.parsedInput.skipReadme
        }, {
            message: 'Write readme',
            type: 'editor',
            name: 'readme',
            postfix: '.md',
            when: (hash) => {
                return hash.editReadme
            },
            default: context.parsedInput.readme
        }]);
        if (inq1.readme) {
            context.parsedInput.readme = inq1.readme;
        }
    }
}