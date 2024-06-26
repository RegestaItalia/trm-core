import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";


export const editSapEntries: Step<PublishWorkflowContext> = {
    name: 'edit-sap-entries',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if(context.parsedInput.skipEditSapEntries || context.parsedInput.silent){
            Logger.log(`Skip edit of SAP entries (input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        var editorValue = '{}';
        if(context.runtime.manifest.sapEntries){
            editorValue = JSON.stringify(context.runtime.manifest.sapEntries, null, 2);
        }
        const inq1 = await Inquirer.prompt([{
            message: `Manually edit required SAP entries?`,
            type: 'confirm',
            name: 'editSapEntries',
            default: false
        }, {
            message: 'Edit SAP entries',
            type: 'editor',
            name: 'sapEntries',
            postfix: '.json',
            when: (hash) => {
                return hash.editSapEntries
            },
            default: editorValue,
            validate: (input) => {
                try {
                    const parsedInput = JSON.parse(input);
                    if(typeof(parsedInput) === 'object' && !Array.isArray(parsedInput)){
                        return true;
                    }else{
                        return 'Invalid object';
                    }
                } catch (e) {
                    return 'Invalid JSON';
                }
            }
        }]);
        if (inq1.sapEntries) {
            Logger.log(`SAP entries have been manually edited: before -> ${JSON.stringify(context.runtime.manifest.sapEntries)}, after -> ${inq1.sapEntries}`, true);
            context.runtime.manifest.sapEntries = JSON.parse(inq1.sapEntries);
        } else {
            Logger.log(`SAP entries are not been manually edited`, true);
            context.runtime.manifest.sapEntries = context.runtime.manifest.sapEntries || {};
        }
    }
}