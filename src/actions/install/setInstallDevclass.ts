import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { adjustTrmServerRestDevclass, getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { Logger, Inquirer, Question } from "trm-commons";
import { flattenDevclasses, getInstallNamespace } from "./addNamespace";
import { validateInstallDevclass } from "./checkInstallDevclass";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function _validateDevclass(input: string, namespaces?: string[]): string | true {
    const sInput: string = input.trim().toUpperCase();
    if (sInput.length > 30) {
        return `Package name must not exceede 30 characters limit.`;
    }
    if (namespaces) {
        namespaces = [...new Set(namespaces)]; //unique
        if (!namespaces.some(ns => sInput.startsWith(ns))) {
            return `Package name must use one of the following namespaces: ${namespaces.join(', ')}.`;
        } else {
            return true;
        }
    } else {
        return true;
    }
}

/**
 * Workflow step that resolves publisher ABAP packages to target-system package names.
 * 
 * 1- find already defined replacements in system
 * 
 * 2- get root devclass and find namespace
 * 
 * 3- if all package names like origin, import devc transport
 * 
*/
export const setInstallDevclass: Step<InstallWorkflowContext> = {
    name: 'set-install-devclass',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installDevclass.keepOriginal) {
            Logger.log(`Skipping set devclass replacements (user input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- find already defined replacements in system
        if (context.rawInput.installData.installDevclass.replacements.length <= 0) {
            //no input replacements = get from the trm table devclass replacements the corresponding name
            Logger.loading(`Checking package replacements...`);
            context.rawInput.installData.installDevclass.replacements = await SystemConnector.getInstallPackages(context.rawInput.packageData.name, context.runtime.installRegistry);
        } else if (context.runtime.update) {
            //explicit replacements win; stored ones keep the devclasses they don't mention renamed
            const explicit = new Set(context.rawInput.installData.installDevclass.replacements.map(o => o.originalDevclass));
            const stored = (context.runtime.previousInstallPackages || []).filter(o => !explicit.has(o.originalDevclass));
            stored.forEach(o => Logger.log(`Keeping stored package replacement ${o.originalDevclass} -> ${o.installDevclass}`, true));
            context.rawInput.installData.installDevclass.replacements = [
                ...context.rawInput.installData.installDevclass.replacements,
                ...stored.map(o => ({ originalDevclass: o.originalDevclass, installDevclass: o.installDevclass }))
            ];
        }
        //drop replacements of devclasses that are not part of the release (e.g. removed in this version)
        const originalDevclasses = flattenDevclasses(context.runtime.package.hierarchy);
        context.rawInput.installData.installDevclass.replacements = context.rawInput.installData.installDevclass.replacements.filter(replacement => {
            if (originalDevclasses.includes(replacement.originalDevclass)) {
                return true;
            }
            Logger.log(`Ignoring package replacement ${replacement.originalDevclass} -> ${replacement.installDevclass}: devclass is not part of the release`, true);
            return false;
        });
        //if there are replacements and they all equal to original ask if you should continue
        const replacementsKeepOriginal = context.rawInput.installData.installDevclass.replacements.length > 0
            && context.rawInput.installData.installDevclass.replacements.every(replacement => replacement.installDevclass === replacement.originalDevclass);
        if (replacementsKeepOriginal) {
            let continueWithReplacements = false;
            if (!context.rawInput.contextData.noInquirer) {
                continueWithReplacements = (await Inquirer.prompt({
                    type: 'confirm',
                    name: 'continueWithReplacements',
                    message: `Do you want to change original SAP packages name?`,
                    default: false
                })).continueWithReplacements;
            }
            if (!continueWithReplacements) {
                // Later workflow steps use this flag to import the original DEVC transport.
                context.rawInput.installData.installDevclass.keepOriginal = true;
                // Packages new in this release keep their name too, and are mapped like the others.
                originalDevclasses
                    .filter(originalDevclass => !context.rawInput.installData.installDevclass.replacements.some(o => o.originalDevclass === originalDevclass))
                    .forEach(originalDevclass => context.rawInput.installData.installDevclass.replacements.push({
                        originalDevclass,
                        installDevclass: originalDevclass
                    }));
                return;
            }
        }

        //2- find the namespace of the original root, carried over onto new devclasses
        const originalNamespace = getPackageNamespace(context.runtime.package.hierarchy.devclass);
        // Only carry the currently installed namespace forward onto newly introduced original
        // devclasses when the package was genuinely customized before (some stored replacement
        // actually renamed a package). Otherwise "currently installed" is just this package's
        // own untouched default from whichever version happens to be installed right now, and
        // has nothing to do with the namespace of the version being installed/rolled back to.
        const hasCustomization = context.rawInput.installData.installDevclass.replacements.some(
            replacement => replacement.installDevclass !== replacement.originalDevclass
        );
        let updateNamespace;
        if (context.runtime.update && hasCustomization) {
            //the installed root devclass can be unknown: fall back to the stored root replacement
            const installedRootDevclass = context.runtime.update.getDevclass()
                || context.runtime.previousInstallPackages?.find(o => o.originalDevclass === context.runtime.package.hierarchy.devclass)?.installDevclass;
            if (installedRootDevclass) {
                updateNamespace = getPackageNamespace(installedRootDevclass);
            } else {
                Logger.log(`Installed root devclass is unknown, namespace won't be carried over`, true);
            }
        }

        const inq1Prompts: Question[] = [];
        Logger.loading(`Analyzing package replacements...`);
        for (const originalDevclass of originalDevclasses) {
            let adaptDevclassName = originalDevclass;
            const replacement = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === originalDevclass);
            if (updateNamespace) {
                //only for trm-server and trm-rest with /ATRM/: if no replacement and updating from namespace $, adapt naming convention
                if (!replacement && updateNamespace === '$' && (context.runtime.isTrmServer || context.runtime.isTrmRest)) {
                    adaptDevclassName = adjustTrmServerRestDevclass(adaptDevclassName);
                } else {
                    //original names use the original root namespace; a function keeps `$` literal
                    adaptDevclassName = adaptDevclassName.replace(new RegExp(`^${escapeRegExp(originalNamespace)}`, 'i'), () => updateNamespace);
                }
            } else if (context.runtime.isTrmRest) {
                //extra guard for trm-rest first install: move /ATRM/ to $
                adaptDevclassName = adjustTrmServerRestDevclass(adaptDevclassName);
            }
            if (!replacement) {
                if (context.rawInput.contextData.noInquirer || (context.runtime.isTrmServer || context.runtime.isTrmRest)) {
                    //const automaticValue = _validateDevclass(adaptDevclassName, [updateNamespace || originalNamespace, '$', originalNamespace]);
                    const automaticValue = _validateDevclass(adaptDevclassName);
                    if (automaticValue === true) {
                        context.rawInput.installData.installDevclass.replacements.push({
                            originalDevclass,
                            installDevclass: adaptDevclassName
                        });
                    } else {
                        throw new Error(automaticValue);
                    }
                } else {
                    inq1Prompts.push({
                        type: "input",
                        name: originalDevclass,
                        default: adaptDevclassName,
                        message: `ABAP Package "${adaptDevclassName}" will be imported. Do you want to rename it?`,
                        validate: async (input) => {
                            //return _validateDevclass(input, [updateNamespace || originalNamespace, '$', originalNamespace]);
                            const valid = _validateDevclass(input);
                            return valid === true ? await validateInstallDevclass(context, input.trim().toUpperCase()) : valid;
                        }
                    });
                }
            } else if (!context.rawInput.contextData.noInquirer) {
                inq1Prompts.push({
                    type: "input",
                    name: originalDevclass,
                    default: replacement.installDevclass,
                    message: `Rename ABAP Package "${replacement.installDevclass}"`,
                    validate: async (input) => {
                        //return _validateDevclass(input, [updateNamespace || originalNamespace, '$', originalNamespace]);
                        const valid = _validateDevclass(input);
                        return valid === true ? await validateInstallDevclass(context, input.trim().toUpperCase()) : valid;
                    }
                });
            }
        }
        if (inq1Prompts.length > 0) {
            const inq1 = await Inquirer.prompt(inq1Prompts);
            Object.keys(inq1).forEach(k => {
                //clear before pushing
                context.rawInput.installData.installDevclass.replacements = context.rawInput.installData.installDevclass.replacements.filter(o => o.originalDevclass !== k);
                //push
                context.rawInput.installData.installDevclass.replacements.push({
                    originalDevclass: k,
                    installDevclass: inq1[k].trim().toUpperCase()
                });
            });
        }
        //if one install package starts with $, all must start with $
        //this check is not done by the validator, so it has to be done here
        const hasTemp = context.rawInput.installData.installDevclass.replacements.some(x => x.installDevclass.startsWith('$'));
        if (hasTemp && !context.rawInput.installData.installDevclass.replacements.every(x => x.installDevclass.startsWith('$'))) {
            throw new Error(`All packages must start with prefix $ if one (or more) packages are temporary!`);
        }
        //fail before locks and dependency installs (add-namespace checks again for original package names)
        getInstallNamespace(context);

        //3- if all package names like origin, import devc transport
        context.rawInput.installData.installDevclass.keepOriginal = true;
        context.rawInput.installData.installDevclass.replacements.forEach(o => {
            if (o.installDevclass !== o.originalDevclass) {
                context.rawInput.installData.installDevclass.keepOriginal = false;
            }
        });
    }
}
