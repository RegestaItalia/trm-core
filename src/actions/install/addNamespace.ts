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
            Logger.log(`Package install namespace is ${context.runtime.installData.namespace}, continue`, true);
            return;
        }

        //2- check if namespace already exists (only if customer namespace)
        Logger.loading(`Checking namespace ${context.runtime.installData.namespace} status in system...`);
        const namespaceCheck = await SystemConnector.getNamespace(context.runtime.installData.namespace);
        if (namespaceCheck && namespaceCheck.trnspacet) {
            Logger.log(`Namespace ${context.runtime.installData.namespace} exists in system, continue`, true);
            return;
        } else {
            if (context.runtime.installData.namespace === originalNamespace) {
                //trying to install with the same namespace provided by package
                if (context.rawInput.installData.installDevclass.keepOriginal) {
                    Logger.warning(`Install will continue without importing namespace ${context.runtime.installData.namespace}. Run install with namespace import or manually add namespace in SE03.`, context.runtime.installData.namespace === '/ATRM/');
                    return;
                }
                if (context.rawInput.installData.installDevclass.skipNamespace === undefined && !context.rawInput.contextData.noInquirer) {
                    context.rawInput.installData.installDevclass.skipNamespace = !(await Inquirer.prompt({
                        message: `Package uses namespace ${context.runtime.installData.namespace}, do you want to import it (repair license)?`,
                        name: 'skipNamespace',
                        type: 'confirm',
                        default: true
                    })).skipNamespace;
                }
                if (context.rawInput.installData.installDevclass.skipNamespace) {
                    //namespace doesn't exist but packages must be generated, it's mandatory to have the namespace
                    throw new Error(`Cannot generate packages without namespace ${context.runtime.installData.namespace}. Run install with namespace import or avoid renaming packages.`);
                }
            } else {
                //namespace doesn't exist, force user to create it manually
                throw new Error(`Namespace ${context.runtime.installData.namespace} doesn't exist in ${SystemConnector.getDest()}. Manually add namespace in SE03.`);
            }
        }

        //3- create namespace
        var replicense: TRNLICENSE;
        var aTexts: TRNSPACETT[] = [];
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
        if (!replicense) {
            throw new Error(`Cannot use namespace ${context.runtime.installData.namespace}: unknown repair license.`);
        }
        if (aTexts.length === 0) {
            throw new Error(`Cannot use namespace ${context.runtime.installData.namespace}: unknown description.`);
        }
        if (!context.runtime.stopWarningShown) {
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