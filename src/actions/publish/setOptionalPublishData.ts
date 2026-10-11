import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { RegistryType } from "../../registry";

/**
 * Workflow step that collects optional readme and changelog Markdown for remote registries.
 * 
 * 1- set readme
 * 
 * 2- set changelog
 * 
*/
export const setOptionalReleaseData: Step<PublishWorkflowContext> = {
    name: 'set-optional-release-data',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL) {
            Logger.log(`Skipping optional release data input (registry is local)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const readmeTemplate = `#${context.rawInput.packageData.name}`;
        const changelogTemplate = `${context.rawInput.packageData.name} changelog
=================

Legend
------
\`\`\`
* : fixed
! : changed
+ : added
- : removed
\`\`\`

${new Date().toISOString().split('T')[0]} v${context.rawInput.packageData.version}
-------------------
\`\`\`
...
\`\`\`
`;

        //1- set readme
        if (context.rawInput.publishData.readme === undefined) {
            if (!context.rawInput.contextData.noInquirer && Inquirer.isUi()) {
                context.rawInput.publishData.readme = (await Inquirer.prompt([{
                    message: `Do you want to write a ${context.runtime.latest.data ? 'new ' : ''}readme?`,
                    type: 'confirm',
                    name: 'editReadme',
                    default: false
                }, {
                    message: 'Write readme',
                    type: 'editor',
                    name: 'readme',
                    when: (hash) => {
                        return hash.editReadme
                    },
                    ui: {
                        kind: 'markdown',
                        value: readmeTemplate
                    }
                }])).readme;
            } else if (!context.rawInput.contextData.noInquirer) {
                context.rawInput.publishData.readme = (await Inquirer.prompt([{
                    message: `Do you want to write a ${context.runtime.latest.data ? 'new ' : ''}readme?`,
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
                    default: readmeTemplate
                }])).readme;
            }
        }

        //2- set changelog
        if (context.rawInput.publishData.changelog === undefined) {
            if (!context.rawInput.contextData.noInquirer && Inquirer.isUi()) {
                context.rawInput.publishData.changelog = (await Inquirer.prompt([{
                    message: `Do you want to write a release changelog?`,
                    type: 'confirm',
                    name: 'editChangelog',
                    default: false
                }, {
                    message: 'Write changelog',
                    type: 'editor',
                    name: 'changelog',
                    when: (hash) => {
                        return hash.editChangelog
                    },
                    ui: {
                        kind: 'markdown',
                        value: changelogTemplate
                    }
                }])).changelog;
            } else if (!context.rawInput.contextData.noInquirer) {
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
                    default: changelogTemplate
                }])).changelog;
            }
        }
    }
}
