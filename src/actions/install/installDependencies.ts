import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, inspect } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";
import { InstallDependencyActionInput, installDependency as InstallDependencyWkf } from ".."
import { AbstractRegistry, PUBLIC_RESERVED_KEYWORD, Registry, RegistryProvider } from "../../registry";
import * as _ from "lodash";

const SUBWORKFLOW_NAME = 'install-dependency-sub-install';

/**
 * Installs missing package dependencies.
 * 
 * 1- list dependencies to install
 * 
 * 2- prompt install
 * 
 * 3- run install workflow for each missing dependency
 * 
*/
export const installDependencies: Step<InstallWorkflowContext> = {
    name: 'install-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.dependenciesToInstall.length > 0){
            return true;
        }else{
            Logger.log(`Skipping dependencies install (no packages to install)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Install dependencies step', true);

        //1- list dependencies to install
        if(context.runtime.dependenciesToInstall.length === 1){
            Logger.info(`There is ${context.runtime.dependenciesToInstall.length} missing dependency to install:`);
        }else{
            Logger.info(`There are ${context.runtime.dependenciesToInstall.length} missing dependencies to install:`);
        }
        context.runtime.dependenciesToInstall.forEach((o, i)=> {
            Logger.info(`  ${i+1}/${context.runtime.dependenciesToInstall.length} ${o.name} ${o.version}`);
        });

        //2- prompt install
        var confirmInstall = true;
        if(!context.rawInput.contextData.noInquirer){
            confirmInstall = (await Inquirer.prompt({
                type: 'confirm',
                default: true,
                message: `Install missing dependencies?`,
                name: 'confirmInstall'
            })).confirmInstall;
        }
        if(!confirmInstall){
            throw new Error(`Install aborted`);
        }

        //3- run install workflow for each missing dependency
        var counter: number = 0;
        for(const dependency of context.runtime.dependenciesToInstall){
            counter++;
            Logger.loading(`Getting ready to install missing dependency "${dependency.name}"...`);
            var prefix = `  (${counter}/${context.runtime.dependenciesToInstall.length}) `;
            if(Logger.getPrefix()){
                prefix = `${Logger.getPrefix()} -> ${prefix}`;
            }
            Logger.setPrefix(prefix);
            Inquirer.setPrefix(prefix);
            var inputData: InstallDependencyActionInput = {
                dependencyDataPackage: {
                    name: dependency.name,
                    versionRange: dependency.version,
                    integrity: dependency.integrity,
                    registry: RegistryProvider.getRegistry(dependency.registry)
                },
                contextData: _.cloneDeep(context.rawInput.contextData),
                installData: _.cloneDeep(context.rawInput.installData)
            };
            if(inputData.contextData){
                inputData.contextData.noR3transInfo = true;
            }
            Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
            const result = await InstallDependencyWkf(inputData);
            Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
            Logger.removePrefix();
            Inquirer.removePrefix();
        }
    }
}