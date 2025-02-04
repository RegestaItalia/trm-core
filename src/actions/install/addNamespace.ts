import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { TRNLICENSE, TRNSPACET, TRNSPACETT } from "../../client";
import { Inquirer } from "../../inquirer";

/**
 * Add package namespace for repair.
 * 
 * 1- set namespace
 * 
 * 2- check if namespace already exists (only if customer namespace)
 * 
 * 3- create namespace
 * 
*/
export const addNamespace: Step<InstallWorkflowContext> = {
    name: 'add-namespace',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Add namespace step', true);

        context.runtime.rollback = true;

        //1- set namespace
        var originalNamespace = getPackageNamespace(context.runtime.originalData.hierarchy.devclass);
        Logger.log(`Package original namespace is ${originalNamespace}`, true);
        if (!context.rawInput.installData.installDevclass.keepOriginal && context.rawInput.installData.installDevclass.replacements.length > 0) {
            context.runtime.installData.namespace = getPackageNamespace(context.rawInput.installData.installDevclass.replacements[0].installDevclass);
        } else {
            context.runtime.installData.namespace = originalNamespace
        }
        if (context.runtime.installData.namespace[0] !== '/') {
            Logger.log(`Package install namespace is ${context.runtime.installData.namespace}`, true);
            return;
        }

        //2- check if namespace already exists (only if customer namespace)
        Logger.loading(`Checking namespace ${context.runtime.installData.namespace}...`);
        var namespace: TRNSPACET;
        const namespaceCheck = await SystemConnector.getNamespace(context.runtime.installData.namespace);
        if (namespaceCheck) {
            namespace = namespaceCheck.trnspacet;
        }
        if (namespace) {
            Logger.log(`Namespace ${context.runtime.installData.namespace} already defined`, true);
            return;
        }

        //3- create namespace
        var replicense: TRNLICENSE;
        var texts: TRNSPACETT;
        var aTexts: TRNSPACETT[] = [];
        if (context.runtime.installData.namespace !== originalNamespace) {
            if (!context.rawInput.contextData.noInquirer) {
                replicense = (await Inquirer.prompt({
                    message: `Input repair license for namespace ${context.runtime.installData.namespace}`,
                    name: 'replicense',
                    type: 'input',
                    validate: (input) => {
                        if (/^\d+$/.test(input)) {
                            return true;
                        } else {
                            return 'Invalid characters';
                        }
                    }
                })).replicense;
                texts = await Inquirer.prompt([{
                    message: `dummy`,
                    name: 'namespace',
                    type: 'input',
                    when: false,
                    default: context.runtime.installData.namespace
                }, {
                    message: `Namespace owner`,
                    name: 'owner',
                    type: 'input'
                }, {
                    message: `Namespace language`,
                    name: 'spras',
                    type: 'input'
                }, {
                    message: `Namespace description`,
                    name: 'descriptn',
                    type: 'input'
                }]);
            }
        } else {
            if (context.runtime.remotePackageData.trmManifest.namespace) {
                replicense = context.runtime.remotePackageData.trmManifest.namespace.replicense;
                if (context.runtime.remotePackageData.trmManifest.namespace.texts && context.runtime.remotePackageData.trmManifest.namespace.texts.length > 0) {
                    if (context.runtime.remotePackageData.trmManifest.namespace.texts.length === 1 || context.rawInput.contextData.noInquirer) {
                        texts = {
                            namespace: context.runtime.installData.namespace,
                            descriptn: context.runtime.remotePackageData.trmManifest.namespace.texts[0].description,
                            owner: context.runtime.remotePackageData.trmManifest.namespace.texts[0].owner,
                            spras: context.runtime.remotePackageData.trmManifest.namespace.texts[0].language
                        };
                    } else {
                        if (!context.rawInput.contextData.noInquirer) {
                            texts = (await Inquirer.prompt({
                                type: 'list',
                                message: 'Choose namespace install text',
                                name: 'choice',
                                choices: context.runtime.remotePackageData.trmManifest.namespace.texts.map(o => {
                                    return {
                                        name: `${o.language} ${o.description} ${o.owner}`,
                                        value: {
                                            namespace: context.runtime.installData.namespace,
                                            descriptn: o.description,
                                            owner: o.owner,
                                            spras: o.language
                                        }
                                    }
                                })
                            })).choice;
                        }
                    }
                }
            }
        }
        if (!replicense) {
            throw new Error(`Cannot use namespace ${context.runtime.installData.namespace}: repair license missing.`);
        }
        if (!texts) {
            throw new Error(`Cannot use namespace ${context.runtime.installData.namespace}: data missing.`);
        } else {
            aTexts.push(texts);
            if (texts.spras != SystemConnector.getLogonLanguage(true)) {
                aTexts.push({ ...texts, ...{ spras: SystemConnector.getLogonLanguage(true) } });
            }
        }
        Logger.loading(`Installing namespace ${context.runtime.installData.namespace}...`);
        await SystemConnector.addNamespace(context.runtime.installData.namespace, replicense, aTexts);
        context.runtime.generatedData.namespace = context.runtime.installData.namespace;
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.runtime.generatedData.namespace) {
            //TODO - remove
            //only perform if devclass was removed!
        }
    }
}