import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { Inquirer, validateDevclass } from "../../inquirer";
import { DEVCLASS } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { getPackageNamespace } from "../../commons";

/**
 * Set ABAP package name for publish
 * 
 * 1- set input devclass
 * 
 * 2- search devclass from installed packages (if input was not provided)
 * 
 * 3- user input devclass
 * 
 * 4- set devclass objects
 * 
 * 5- read namespace
 * 
*/
export const setDevclass: Step<PublishWorkflowContext> = {
    name: 'set-devclass',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set devclass step', true);

        var needsValidation: boolean;

        //1- set input devclass
        var devclass: DEVCLASS = context.rawInput.packageData.devclass;

        //2- search devclass from installed packages (if input was not provided)
        if (devclass === undefined) {
            const trmPackage = context.rawInput.contextData.systemPackages.find(o => TrmPackage.compare(o, new TrmPackage(context.rawInput.packageData.name, context.rawInput.packageData.registry)));
            if (trmPackage) {
                devclass = trmPackage.getDevclass();
            }

            //3- user input devclass
            if (!context.rawInput.contextData.noInquirer) {
                devclass = (await Inquirer.prompt({
                    type: 'input',
                    message: 'ABAP package name',
                    name: 'devclass',
                    default: devclass,
                    validate: async (input: string) => {
                        return await validateDevclass(input, false);
                    }
                })).devclass.trim().toUpperCase();
                Logger.log(`Publish devclass set to "${devclass}"`, true);
                needsValidation = false;
            }else{
                needsValidation = true;
            }
        }else{
            needsValidation = true;
        }

        if(needsValidation){
            const validate = await validateDevclass(devclass, false);
            if (validate && validate !== true) {
                throw new Error(validate);
            }
            Logger.info(`Publish ABAP package: "${devclass}"`);
        }


        context.rawInput.packageData.devclass = devclass;

        //4- set devclass objects
        Logger.loading(`Reading "${context.rawInput.packageData.devclass}" objects...`);
        context.runtime.packageData.tadir = await SystemConnector.getDevclassObjects(context.rawInput.packageData.devclass, true);

        //5- read namespace
        const packageNamespace = getPackageNamespace(context.rawInput.packageData.devclass);
        if(packageNamespace[0] === '/'){
            Logger.loading(`Reading namespace ${packageNamespace}...`);
            const namespace = await SystemConnector.getNamespace(packageNamespace);
            if(namespace && namespace.trnspacet && namespace.trnspacett.length > 0){
                context.runtime.packageData.namespace = {
                    trnspacet: namespace.trnspacet,
                    trnspacett: namespace.trnspacett
                };
            }else{
                throw new Error(`Namespace ${packageNamespace} couldn't be found on ${SystemConnector.getDest()}.`);
            }
        }
    }
}