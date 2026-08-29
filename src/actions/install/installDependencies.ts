import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { InstallDependencyActionInput, installDependency as InstallDependencyWkf } from ".."
import { Manifest } from "../../manifest";
import { RegistryProvider } from "../../registry";
import { TrmPackage } from "../../trmPackage";
import * as _ from "lodash";

/**
 * Workflow step that installs each dependency missing from the target system.
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
        if(context.runtime.dependencies.length > 0){
            return true;
        }else{
            Logger.log(`Skipping dependencies install (no packages to install)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- list dependencies to install
        if(context.runtime.dependencies.length === 1){
            Logger.info(`There is ${context.runtime.dependencies.length} missing dependency to install:`);
        }else{
            Logger.info(`There are ${context.runtime.dependencies.length} missing dependencies to install:`);
        }
        context.runtime.dependencies.forEach((o, i)=> {
            Logger.info(`  ${i+1}/${context.runtime.dependencies.length} ${o.name} ${o.version}`);
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
            throw new Error(`Install aborted.`);
        }

        //3- run install workflow for each missing dependency
        var counter: number = 0;
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        for(const dependency of context.runtime.dependencies){
            counter++;
            Logger.loading(`Getting ready to install missing dependency "${dependency.name}"...`);
            var prefix = `(${counter}/${context.runtime.dependencies.length}) `;
            try {
                if(originalLPrefix){
                    Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
                }else{
                    Logger.setPrefix(`  ${prefix}`);
                }
                if(originalIPrefix){
                    Inquirer.setPrefix(`${originalIPrefix}-> ${prefix}`);
                }else{
                    Inquirer.setPrefix(`  ${prefix}`);
                }
                const dependencyRegistry = RegistryProvider.getRegistry(dependency.registry);
                var inputData: InstallDependencyActionInput = {
                    dependencyDataPackage: {
                        name: dependency.name,
                        versionRange: dependency.version,
                        registry: dependencyRegistry
                    },
                    contextData: _.cloneDeep(context.rawInput.contextData),
                    installData: _.cloneDeep(context.rawInput.installData)
                };
                delete inputData.installData.installDevclass.keepOriginal; //force input value if inquirer allows
                const result = await InstallDependencyWkf(inputData);
                const installedPackage = new TrmPackage(
                    result.installOutput.manifest.name,
                    dependencyRegistry,
                    new Manifest(result.installOutput.manifest)
                );
                const installedIndex = context.rawInput.contextData.systemPackages.findIndex(
                    systemPackage => TrmPackage.compare(systemPackage, installedPackage)
                );
                if (installedIndex === -1) {
                    context.rawInput.contextData.systemPackages.push(installedPackage);
                } else {
                    context.rawInput.contextData.systemPackages.splice(installedIndex, 1, installedPackage);
                }
            } finally {
                Logger.setPrefix(originalLPrefix);
                Inquirer.setPrefix(originalIPrefix);
            }
        }
    }
}
