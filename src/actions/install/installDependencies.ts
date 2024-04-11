import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";
import { InstallDependencyActionInput, installDependency as installDependencyWkf } from "../installDependency";
import { inspect } from "util";
import { Registry } from "../../registry";

const SUBWORKFLOW_NAME = 'install-sub-install-dependency';

export const installDependencies: Step<InstallWorkflowContext> = {
    name: 'install-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.dependenciesToInstall.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping dependencies install because there are no dependencies to install`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const mainPackageName = context.parsedInput.packageName;
        const dependenciesToInstall = context.runtime.dependenciesToInstall;
        var continueInstall = false;
        if (context.parsedInput.installMissingDependencies) {
            continueInstall = true;
        } else {
            if(!context.parsedInput.noInquirer){
                const inq1 = await Inquirer.prompt({
                    type: 'confirm',
                    name: 'continueInstall',
                    default: true,
                    message: `Do you wish to install all of the missing dependencies?`
                });
                continueInstall = inq1.continueInstall;
            }else{
                Logger.info(`Dependencies are not being installed: running in silent and no action was taken.`);
                continueInstall = false;
            }
        }
        if (continueInstall) {
            var installCounter = 0;
            for(const installDependency of dependenciesToInstall){
                installCounter++;
                Logger.info(`-> (${installCounter}/${dependenciesToInstall.length}) Dependency "${installDependency.name}" install started.`);
                const inputData: InstallDependencyActionInput = {
                    packageName: installDependency.name,
                    versionRange: installDependency.version,
                    installOptions: context.rawInput,
                    registry: new Registry(installDependency.registry || 'public'),
                    integrity: installDependency.integrity,
                    systemPackages: context.parsedInput.systemPackages,
                    forceInstall: context.parsedInput.skipAlreadyInstalledCheck //check already installed? 
                };
                Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
                const result = await installDependencyWkf(inputData);
                Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
                Logger.info(`   (${installCounter}/${dependenciesToInstall.length}) Dependency "${installDependency.name}" install completed.`);
            }
            Logger.success(`-> ${dependenciesToInstall.length}/${dependenciesToInstall.length} dependencies installed, package "${mainPackageName}" install can continue.`);
        } else {
            throw new Error(`Package has missing dependencies that need to be installed in order to continue.`);
        }
    }
}