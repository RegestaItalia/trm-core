import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { getPackageHierarchy, getPackageNamespace } from "../../commons";
import { Question } from "../../inquirer";
import { Inquirer } from "../../inquirer/Inquirer";
import { ZTRM_INSTALLDEVC } from "../../client";
import { RegistryType } from "../../registry";

function _validateDevclass(input: string, packagesNamespace: string): string | true {
    const sInput: string = input.trim().toUpperCase();
    if (sInput.length > 30) {
        return `Package name must not exceede 30 characters limit.`;
    }
    if (packagesNamespace.startsWith('/')) {
        if (!sInput.startsWith(packagesNamespace)) {
            return `Package name must use namespace "${packagesNamespace}".`;
        } else {
            return true;
        }
    } else {
        return true;
    }
}

export const setDevclass: Step<InstallWorkflowContext> = {
    name: 'set-devclass',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const tdevc = context.runtime.tdevcData;
        const keepOriginalPackages = context.parsedInput.keepOriginalPackages;
        const packageName = context.parsedInput.packageName;
        const registry = context.runtime.registry;
        const forceDevclassInput = context.parsedInput.forceDevclassInput;
        var packageReplacements = context.runtime.packageReplacements;

        //build the package hierarchy
        const originalPackageHierarchy = getPackageHierarchy(tdevc);
        if (keepOriginalPackages) {
            packageReplacements = tdevc.map(o => {
                return {
                    originalDevclass: o.devclass,
                    installDevclass: o.devclass
                }
            });
        } else {
            if (packageReplacements.length < 0) {
                //get from the trm table devclass replacements the corresponding name
                packageReplacements = await SystemConnector.getInstallPackages(packageName, registry);
            }
        }
        var rootDevclass = packageReplacements.find(o => o.originalDevclass === originalPackageHierarchy.devclass)?.installDevclass;
        if (!rootDevclass) {
            rootDevclass = originalPackageHierarchy.devclass;
        }
        context.runtime.packageReplacements = packageReplacements;

        const packagesNamespace = getPackageNamespace(rootDevclass);
        var inq1Prompts: Question[] = [];
        tdevc.forEach(t => {
            const replacement = packageReplacements.find(o => o.originalDevclass === t.devclass);
            if (!replacement || forceDevclassInput) {
                inq1Prompts.push({
                    type: "input",
                    name: t.devclass,
                    default: t.devclass,
                    message: `Input name for package "${t.devclass}"`,
                    validate: (input) => {
                        return _validateDevclass(input, packagesNamespace);
                    }
                });
            } else {
                const devclassValid = _validateDevclass(replacement.installDevclass, packagesNamespace);
                if (devclassValid !== true) {
                    throw new Error(devclassValid);
                }
            }
        });
        if (inq1Prompts.length > 0) {
            const inq1 = await Inquirer.prompt(inq1Prompts);
            Object.keys(inq1).forEach(k => {
                //clear before pushing
                packageReplacements = packageReplacements.filter(o => o.originalDevclass !== k);
                packageReplacements.push({
                    originalDevclass: k,
                    installDevclass: inq1[k].trim().toUpperCase()
                });
            });
        }

        //update z table
        Logger.loading(`Updating install packages...`);
        var installDevc: ZTRM_INSTALLDEVC[] = [];
        packageReplacements.forEach(o => {
            installDevc.push({
                package_name: packageName,
                package_registry: registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : registry.endpoint,
                original_devclass: o.originalDevclass,
                install_devclass: o.installDevclass
            });
        });
        await SystemConnector.setInstallDevc(installDevc);
        context.runtime.originalPackageHierarchy = originalPackageHierarchy;
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        //there's not real reason to revert? keeping records in ZTRM_INSTALLDEVC shouldn't have any impact
    }
}