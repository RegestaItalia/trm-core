import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { DEVCLASS } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { flattenDevclasses } from "./addNamespace";
import { getOwningInstallation } from "../commons/utils";

async function getTree(devclass: DEVCLASS): Promise<DEVCLASS[]> {
    return [devclass, ...(await SystemConnector.getSubpackages(devclass)).map(o => o.devclass)];
}

/**
 * Validates one install package name chosen by the user, so the prompt can ask again: it must be
 * outside the SAP packages of the other installed TRM packages and, when it exists, contain none of
 * their root packages. check-install-devclass repeats the check on the final choice.
 */
export async function validateInstallDevclass(context: InstallWorkflowContext, devclass: DEVCLASS): Promise<true | string> {
    const systemPackages = context.rawInput.contextData.systemPackages || [];
    const owner = await getOwningInstallation(devclass, systemPackages, context.runtime.update);
    if (owner) {
        return `ABAP package ${devclass} belongs to installed TRM package "${owner.packageName}": choose a package outside of it.`;
    }
    if (await SystemConnector.getDevclass(devclass)) {
        const roots = new Map(systemPackages.filter(o => o !== context.runtime.update && o.getDevclass()).map(o => [o.getDevclass().trim().toUpperCase(), o]));
        for (const subpackage of await SystemConnector.getSubpackages(devclass)) {
            const nested = roots.get(subpackage.devclass.trim().toUpperCase());
            if (nested) {
                return `ABAP package ${devclass} contains package ${subpackage.devclass} of installed TRM package "${nested.packageName}": choose a package outside of it.`;
            }
        }
    }
    return true;
}

/**
 * Workflow step that rejects an install whose target ABAP packages would nest it with another
 * installed TRM package, before anything is locked or installed.
 *
 * 1- collect the ABAP package trees of the other installed TRM packages
 *
 * 2- reject install packages inside one of those trees
 *
 * 3- reject existing install packages that contain another TRM package
 *
 * On update, the package's own installed tree stays allowed, also when it is already nested
 * in another TRM package.
 *
*/
export const checkInstallDevclass: Step<InstallWorkflowContext> = {
    name: 'check-install-devclass',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const replacements = context.rawInput.installData.installDevclass.replacements;
        const installDevclasses = [...new Set(flattenDevclasses(context.runtime.package.hierarchy)
            .map(originalDevclass => replacements.find(o => o.originalDevclass === originalDevclass)?.installDevclass || originalDevclass)
            .map(devclass => devclass.trim().toUpperCase()))];

        Logger.loading(`Checking installed packages...`);
        const updateRoot = context.runtime.update?.getDevclass();
        const ownTree = new Set(updateRoot ? await getTree(updateRoot) : []);

        //1- collect the ABAP package trees of the other installed TRM packages
        const owners = new Map<DEVCLASS, string>();
        const otherRoots = new Map<DEVCLASS, string>();
        for (const trmPackage of context.rawInput.contextData.systemPackages || []) {
            const root = trmPackage.getDevclass();
            if (!root || trmPackage === context.runtime.update) {
                continue;
            }
            otherRoots.set(root, trmPackage.packageName);
            const tree = await getTree(root);
            //installed package already nested in this one: its own tree is not owned by this one
            const containsOwn = updateRoot && tree.includes(updateRoot);
            for (const devclass of tree) {
                if (!(containsOwn && ownTree.has(devclass))) {
                    owners.set(devclass, trmPackage.packageName);
                }
            }
        }

        //2- reject install packages inside one of those trees
        for (const devclass of installDevclasses) {
            const owner = owners.get(devclass);
            if (owner) {
                throw new Error(`ABAP package ${devclass} belongs to installed TRM package "${owner}": choose a package outside of it.`);
            }
        }

        //3- reject existing install packages that contain another TRM package
        for (const devclass of installDevclasses) {
            if (ownTree.has(devclass) || !(await SystemConnector.getDevclass(devclass))) {
                continue;
            }
            for (const subpackage of await getTree(devclass)) {
                const nested = otherRoots.get(subpackage);
                if (nested) {
                    throw new Error(`ABAP package ${devclass} contains package ${subpackage} of installed TRM package "${nested}": choose a package outside of it.`);
                }
            }
        }
    }
}
