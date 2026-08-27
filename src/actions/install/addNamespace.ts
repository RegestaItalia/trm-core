import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { TRNLICENSE, TRNSPACETT } from "../../client";
import { stopWarning } from "../stopWarning";

/**
 * Workflow step that registers the package namespace for repair when required.
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
        //1- set namespace
        var originalNamespace = getPackageNamespace(context.runtime.package.hierarchy.devclass);
        Logger.log(`Package original namespace is ${originalNamespace}`, true);
        if (!context.rawInput.installData.installDevclass.keepOriginal && context.rawInput.installData.installDevclass.replacements.length > 0) {
            context.runtime.namespace = getPackageNamespace(context.rawInput.installData.installDevclass.replacements[0].installDevclass);
        } else {
            context.runtime.namespace = originalNamespace
        }
        if (context.runtime.namespace[0] !== '/') {
            Logger.log(`Package install namespace is ${context.runtime.namespace}, continue`, true);
            return;
        }

        //2- check if namespace already exists (only if customer namespace)
        Logger.loading(`Checking namespace ${context.runtime.namespace}...`);
        const namespaceCheck = await SystemConnector.getNamespace(context.runtime.namespace);
        if (namespaceCheck && namespaceCheck.trnspacet) {
            Logger.log(`Namespace ${context.runtime.namespace} exists in system, continue`, true);
            return;
        } else {
            if (context.runtime.namespace === originalNamespace) {
                //trying to install with the same namespace provided by package
                //TODO: this if, i don't understand. it seems like if skipNamespace is set to false it will skip it anyway?
                if (context.rawInput.installData.installDevclass.keepOriginal) {
                    Logger.warning(`Install will continue without importing namespace ${context.runtime.namespace}. Run install with namespace import or manually add namespace in SE03.`, context.runtime.namespace === '/ATRM/');
                    return;
                }
                if (context.rawInput.installData.installDevclass.skipNamespace === undefined && !context.rawInput.contextData.noInquirer) {
                    context.rawInput.installData.installDevclass.skipNamespace = !(await Inquirer.prompt({
                        message: `Package uses namespace ${context.runtime.namespace}, do you want to import it (repair license)?`,
                        name: 'skipNamespace',
                        type: 'confirm',
                        default: true
                    })).skipNamespace;
                }
                if (context.rawInput.installData.installDevclass.skipNamespace) {
                    //namespace doesn't exist but packages must be generated, it's mandatory to have the namespace
                    throw new Error(`Cannot generate packages without namespace ${context.runtime.namespace}. Run install with namespace import or avoid renaming packages.`);
                }
            } else {
                //namespace doesn't exist, force user to create it manually
                throw new Error(`Namespace ${context.runtime.namespace} doesn't exist in ${SystemConnector.getDest()}. Manually add namespace in SE03.`);
            }
        }

        //3- create namespace
        var replicense: TRNLICENSE;
        var aTexts: TRNSPACETT[] = [];
        if (context.runtime.package.data.manifest.namespace) {
            replicense = context.runtime.package.data.manifest.namespace.replicense;
            aTexts = context.runtime.package.data.manifest.namespace.texts.map(o => {
                return {
                    namespace: context.runtime.package.data.manifest.namespace.ns || context.runtime.namespace,
                    spras: o.language,
                    descriptn: o.description,
                    owner: o.owner
                };
            });
        }
        if (!replicense) {
            throw new Error(`Cannot use namespace ${context.runtime.namespace}: unknown repair license.`);
        }
        if (aTexts.length === 0) {
            throw new Error(`Cannot use namespace ${context.runtime.namespace}: unknown description.`);
        }
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }
        Logger.loading(`Installing namespace ${context.runtime.namespace}...`);
        await SystemConnector.addNamespace(context.runtime.namespace, replicense, aTexts);
        context.revert.namespace = context.runtime.namespace;
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if(context.revert.namespace){
            //TODO: namespace was installed, it needs to be removed
            //deletion transport necessary? or function call?
        }
    }  
}
