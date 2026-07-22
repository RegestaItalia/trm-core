import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { RegistryType } from "../../registry";

/**
 * Set changelog
 * 
 * 1- set changelog
 * 
*/
export const setChangelog: Step<PublishWorkflowContext> = {
    name: 'set-changelog',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if(context.rawInput.publishData.changelog !== undefined){
            Logger.log(`Skipping changelog input (user provided)`, true);
            return false;
        }else{
            if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL){
                Logger.log(`Skipping changelog input (registry is local)`, true);
                return false;
            }else{
                return true;
            }
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set changelog step', true);

        //1- set changelog
        if(!context.rawInput.contextData.noInquirer){
            context.rawInput.publishData.changelog = (await Inquirer.prompt([{
                message: `Do you want to write a release changelog?`,
                type: 'confirm',
                name: 'editChangelog',
                default: false
            }, {
                message: 'Write changelog',
                type: 'editor',
                name: 'changelog',
                postfix: '.md',
                when: (hash) => {
                    return hash.editChangelog
                },
                default: `${context.rawInput.packageData.name} changelog
=================

Legend
------
\`\`\`
* : fixed
! : changed
+ : added
- : removed
\`\`\`

${new Date().toISOString().split('T')[0]} v${context.runtime.trmPackage.manifest.version}
-------------------
\`\`\`
...
\`\`\`
`
            }])).changelog;
        }
    }
}