import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { parsePackageName } from "../../commons";
import { validRange } from "semver";
import { RegistryType } from "../../registry";

/**
 * Init
 * 
 * 1- check package name is compliant
 * 
 * 2- check registry is not local
 * 
 * 3- validate version range
 * 
 * 4- fill runtime values
 * 
 * 5- fill input values
 * 
*/
export const init: Step<InstallDependencyWorkflowContext> = {
    name: 'init',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);

        //1- check package name is compliant
        context.rawInput.dependencyDataPackage.name = parsePackageName({
            fullName: context.rawInput.dependencyDataPackage.name
        }).fullName;

        //2- check registry is not local
        if(context.rawInput.dependencyDataPackage.registry.getRegistryType() === RegistryType.LOCAL){
            throw new Error(`Cannot install package "${context.rawInput.dependencyDataPackage.name}": TRM package has to be installed manually.`);
        }

        //3- validate version range
        context.rawInput.dependencyDataPackage.versionRange = validRange(context.rawInput.dependencyDataPackage.versionRange);
        if (!context.rawInput.dependencyDataPackage.versionRange) {
            throw new Error(`Dependency "${context.rawInput.dependencyDataPackage.name}", invalid version range.`);
        }

        //4- fill runtime values
        context.runtime = {
            rollback: false,
            installOutput: undefined,
            installVersion: undefined
        }

        //5- fill input values
        if(!context.rawInput.contextData){
            context.rawInput.contextData = {};
        }
        if(!context.rawInput.installData){
            context.rawInput.installData = {};
        }
        if(!context.rawInput.installData.import){
            context.rawInput.installData.import = {};
        }
        if(!context.rawInput.installData.installDevclass){
            context.rawInput.installData.installDevclass = {};
        }
        if(context.rawInput.contextData.noInquirer){
            Logger.info(`Dependency "${context.rawInput.dependencyDataPackage.name}" will be installed with default options.`);
        }else{
            const inq = await Inquirer.prompt([{
                name: 'noLang',
                message: `Dependency "${context.rawInput.dependencyDataPackage.name}": Import language transport (if exists)?`,
                type: 'confirm',
                default: !context.rawInput.installData.import.noLang
            }, {
                name: 'noCust',
                message: `Dependency "${context.rawInput.dependencyDataPackage.name}": Import customizing transport (if exists)?`,
                type: 'confirm',
                default: !context.rawInput.installData.import.noCust
            }, {
                name: 'keepOriginal',
                message: `Dependency "${context.rawInput.dependencyDataPackage.name}": Keep original ABAP package(s)?`,
                type: 'confirm',
                default: context.rawInput.installData.installDevclass.keepOriginal ? true : false
            }]);
            context.rawInput.installData.import.noLang = inq.noLang;
            context.rawInput.installData.import.noCust = inq.noCust;
            context.rawInput.installData.installDevclass.keepOriginal = inq.keepOriginal;
        }
    },
    revert: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        Logger.log('Rollback init step', true);
        
        if(context.runtime && context.runtime.rollback){
            Logger.success(`Rollback executed.`);
        }
    }
}