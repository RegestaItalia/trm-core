import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { Inquirer, Question } from "../../inquirer";
import { ZTRM_INSTALLDEVC } from "../../client";
import { LOCAL_RESERVED_KEYWORD, PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

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

/**
 * Set install devclass. These are the ABAP package names that will be used in the target system.
 * 
 * 1- set replacements from input/find already defined replacements in system
 * 
 * 2- get root devclass and find namespace
 * 
 * 3- update z table
 * 
*/
export const setInstallDevclass: Step<InstallWorkflowContext> = {
    name: 'set-install-devclass',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.installData.installDevclass.keepOriginal){
            Logger.log(`Skipping set devclass replacements (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Set install devclass step', true);
        
        //1- set replacements from input/find already defined replacements in system
        if (context.rawInput.installData.installDevclass.keepOriginal) {
            context.rawInput.installData.installDevclass.replacements = context.runtime.packageTransportsData.tdevc.map(o => {
                return {
                    originalDevclass: o.devclass,
                    installDevclass: o.devclass
                }
            });
        } else {
            //no input replacements = get from the trm table devclass replacements the corresponding name
            if (context.rawInput.installData.installDevclass.replacements.length <= 0) {
                context.rawInput.installData.installDevclass.replacements = await SystemConnector.getInstallPackages(context.rawInput.packageData.name, context.rawInput.packageData.registry);
            }
        }

        //2- get root devclass and find namespace
        var rootDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === context.runtime.originalData.hierarchy.devclass)?.installDevclass;
        if (!rootDevclass) {
            rootDevclass = context.runtime.originalData.hierarchy.devclass;
        }
        const packagesNamespace = getPackageNamespace(rootDevclass);

        var inq1Prompts: Question[] = [];
        context.runtime.packageTransportsData.tdevc.forEach(t => {
            const replacement = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === t.devclass);
            if (!replacement) {
                if(context.rawInput.contextData.noInquirer){
                    const automaticValue = _validateDevclass(t.devclass, packagesNamespace);
                    if(automaticValue === true){
                        context.rawInput.installData.installDevclass.replacements.push({
                            originalDevclass: t.devclass,
                            installDevclass: t.devclass
                        });
                    }else{
                        throw new Error(automaticValue);
                    }
                }else{
                    inq1Prompts.push({
                        type: "input",
                        name: t.devclass,
                        default: t.devclass,
                        message: `Input name for package "${t.devclass}"`,
                        validate: (input) => {
                            return _validateDevclass(input, packagesNamespace);
                        }
                    });
                }
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
                context.rawInput.installData.installDevclass.replacements = context.rawInput.installData.installDevclass.replacements.filter(o => o.originalDevclass !== k);
                //push
                context.rawInput.installData.installDevclass.replacements.push({
                    originalDevclass: k,
                    installDevclass: inq1[k].trim().toUpperCase()
                });
            });
        }

        //3- update z table
        Logger.loading(`Updating install data...`);
        var installDevc: ZTRM_INSTALLDEVC[] = [];
        var packageRegistry: string;
        if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC){
            packageRegistry = PUBLIC_RESERVED_KEYWORD;
        }else if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL){
            packageRegistry = LOCAL_RESERVED_KEYWORD;
        }else{
            packageRegistry = context.rawInput.packageData.registry.endpoint;
        }
        context.rawInput.installData.installDevclass.replacements.forEach(o => {
            installDevc.push({
                package_name: context.rawInput.packageData.name,
                package_registry: packageRegistry,
                original_devclass: o.originalDevclass,
                install_devclass: o.installDevclass
            });
        });
        await SystemConnector.setInstallDevc(installDevc);
    }
}