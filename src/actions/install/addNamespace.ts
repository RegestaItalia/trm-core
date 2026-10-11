import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { getPackagesNamespace, PackageHierarchy } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import type { TRNLICENSE, TRNSPACETT } from "../../client";
import { stopWarning } from "../stopWarning";

export function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [
        pkg.devclass,
        ...pkg.sub.flatMap(flattenDevclasses),
    ];
}

/**
 * Returns the namespace packages are installed into: the target names, or the original names when
 * `original` is set or `keepOriginal` is used. See getPackagesNamespace.
 */
export function getInstallNamespace(context: InstallWorkflowContext, original: boolean = false): string {
    const hierarchy = context.runtime.package.hierarchy;
    const originalDevclasses = flattenDevclasses(hierarchy);
    if (original || context.rawInput.installData.installDevclass.keepOriginal) {
        return getPackagesNamespace(hierarchy.devclass, originalDevclasses);
    }
    //ignore stored mappings of devclasses that are no longer part of the release
    const replacements = context.rawInput.installData.installDevclass.replacements.filter(o => originalDevclasses.includes(o.originalDevclass));
    if (replacements.length === 0) {
        return getPackagesNamespace(hierarchy.devclass, originalDevclasses);
    }
    const rootDevclass = replacements.find(o => o.originalDevclass === hierarchy.devclass)?.installDevclass || hierarchy.devclass;
    return getPackagesNamespace(rootDevclass, replacements.map(o => o.installDevclass));
}

/** Imports `namespace` with the repair license and texts shipped by the package manifest. */
async function createNamespace(context: InstallWorkflowContext, namespace: string): Promise<void> {
    let replicense: TRNLICENSE;
    let aTexts: TRNSPACETT[] = [];
    if (context.runtime.package.data.manifest.namespace) {
        replicense = context.runtime.package.data.manifest.namespace.replicense;
        aTexts = context.runtime.package.data.manifest.namespace.texts.map(o => {
            return {
                namespace: context.runtime.package.data.manifest.namespace.ns || namespace,
                spras: o.language,
                descriptn: o.description,
                owner: o.owner
            };
        });
    }
    if (!replicense) {
        throw new Error(`Cannot use namespace ${namespace}: unknown repair license.`);
    }
    if (aTexts.length === 0) {
        throw new Error(`Cannot use namespace ${namespace}: unknown description.`);
    }
    if (!context.runtime.stopWarningShown) {
        context.runtime.stopWarningShown = true;
        stopWarning('install');
    }
    Logger.loading(`Installing namespace ${namespace}...`);
    // Track before the mutating await: SAP may commit the namespace and the
    // connector can still fail while returning the response.
    context.revert.namespace = namespace;
    await SystemConnector.addNamespace(namespace, replicense, aTexts);
}

/**
 * Asks to import the namespace of the objects when the packages are installed outside of it.
 * Declining keeps the previous behavior: the install continues without it.
 */
async function importObjectsNamespace(context: InstallWorkflowContext, namespace: string): Promise<void> {
    if (context.rawInput.installData.installDevclass.skipNamespace === undefined && !context.rawInput.contextData.noInquirer) {
        context.rawInput.installData.installDevclass.skipNamespace = !(await Inquirer.prompt({
            message: `Package objects use namespace ${namespace}, do you want to import it (repair license)?`,
            name: 'skipNamespace',
            type: 'confirm',
            default: true
        })).skipNamespace;
    }
    if (context.rawInput.installData.installDevclass.skipNamespace) {
        Logger.warning(`Install will continue without importing namespace ${namespace}: its objects might not be assigned to the install packages. Run install with namespace import or manually add namespace in SE03.`, { important: true });
        return;
    }
    await createNamespace(context, namespace);
}

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
        const originalNamespace = getInstallNamespace(context, true);
        Logger.log(`Package original namespace is ${originalNamespace}`, true);
        context.runtime.namespace = getInstallNamespace(context);
        if (context.runtime.namespace[0] !== '/') {
            Logger.log(`Package install namespace is ${context.runtime.namespace}, continue`, true);
            // Packages renamed out of the original namespace: the objects keep their names, and can only be
            // assigned to the install packages (and repaired) when their namespace exists.
            if (originalNamespace[0] === '/' && !(await SystemConnector.getNamespace(originalNamespace))?.trnspacet) {
                await importObjectsNamespace(context, originalNamespace);
            }
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
                if (context.rawInput.installData.installDevclass.skipNamespace === undefined && !context.rawInput.contextData.noInquirer) {
                    context.rawInput.installData.installDevclass.skipNamespace = !(await Inquirer.prompt({
                        message: `Package uses namespace ${context.runtime.namespace}, do you want to import it (repair license)?`,
                        name: 'skipNamespace',
                        type: 'confirm',
                        default: true
                    })).skipNamespace;
                }
                if (context.rawInput.installData.installDevclass.skipNamespace) {
                    if (context.rawInput.installData.installDevclass.keepOriginal) {
                        //no packages are being generated under this namespace, importing it is optional
                        Logger.warning(`Install will continue without importing namespace ${context.runtime.namespace}. Run install with namespace import or manually add namespace in SE03.`, { debug: context.runtime.namespace === '/ATRM/', important: true });
                        return;
                    }
                    //namespace doesn't exist but packages must be generated, it's mandatory to have the namespace
                    throw new Error(`Cannot generate packages without namespace ${context.runtime.namespace}. Run install with namespace import or avoid renaming packages.`);
                }
            } else {
                //namespace doesn't exist, force user to create it manually
                throw new Error(`Namespace ${context.runtime.namespace} doesn't exist in ${SystemConnector.getDest()}. Manually add namespace in SE03.`);
            }
        }

        //3- create namespace
        await createNamespace(context, context.runtime.namespace);
    }
}
