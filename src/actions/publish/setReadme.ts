import { Step } from "@sammarks/workflow";
import { PublishWorkflowContext } from ".";
import { Inquirer } from "../../inquirer/Inquirer";


export const setReadme: Step<PublishWorkflowContext> = {
    name: 'set-readme',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const inq1 = await Inquirer.prompt([{
            message: 'Write readme?',
            type: 'confirm',
            name: 'editReadme',
            default: false,
            when: !context.rawInput.skipReadme
        }, {
            message: 'Write readme',
            type: 'editor',
            name: 'readme',
            postfix: '.md',
            when: (hash) => {
                return hash.editReadme
            },
            default: context.rawInput.readme || ''
        }]);
        if (inq1.readme) {
            context.parsedInput.readme = inq1.readme;
        } else {
            context.parsedInput.readme = context.rawInput.readme || '';
        }
    }
}