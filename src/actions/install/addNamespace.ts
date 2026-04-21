import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { TRNLICENSE, TRNSPACET, TRNSPACETT } from "../../client";
import { stopWarning } from "../stopWarning";

/**
 * Add package namespace for repair.
 * 
 * 1- set namespace
 * 
 * 2- check if namespace already exists (only if customer namespace)
 * 
 * 
 * 3- create namespace
 * 
*/
export const addNamespace: Step<InstallWorkflowContext> = {
    name: 'add-namespace',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Add namespace step', true);

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
        }else{
            //if namespace doesn't exist but packages must be generated, it's mandatory to have the namespace
            if(context.rawInput.installData.installDevclass.skipNamespace){
                throw new Error(`Cannot generate packages without namespace ${context.runtime.installData.namespace}. Run install with namespace import or do not rename install packages.`);
            }
        }

        //3- create namespace
        var replicense: TRNLICENSE;
        var text: TRNSPACETT;
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
                text = await Inquirer.prompt([{
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
                    type: 'input',
                    default: SystemConnector.getLogonLanguage(true)
                }, {
                    message: `Namespace description`,
                    name: 'descriptn',
                    type: 'input'
                }]);
                aTexts.push(text);
            }
        } else {
            if (context.runtime.remotePackageData.manifest.namespace) {
                replicense = context.runtime.remotePackageData.manifest.namespace.replicense;
                aTexts = context.runtime.remotePackageData.manifest.namespace.texts.map(o => {
                    return {
                        namespace: context.runtime.remotePackageData.manifest.namespace.ns || context.runtime.installData.namespace,
                        spras: o.language,
                        descriptn: o.description,
                        owner: o.owner
                    };
                });
            }
        }
        if (!replicense) {
            throw new Error(`Cannot use namespace ${context.runtime.installData.namespace}: repair license missing.`);
        }
        if (aTexts.length === 0) {
            throw new Error(`Cannot use namespace ${context.runtime.installData.namespace}: data missing.`);
        }
        if(!context.runtime.stopWarningShown){
            context.runtime.stopWarningShown = true;
            stopWarning('install');
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