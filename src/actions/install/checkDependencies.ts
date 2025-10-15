import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, inspect } from "trm-commons";
import { CheckPackageDependenciesActionInput, checkPackageDependencies as CheckPackageDependenciesWkf } from "../checkPackageDependencies";

const SUBWORKFLOW_NAME = 'check-package-dependencies-sub-install';

/**
 * Check which dependencies are yet to be installed into the target system.
 * 
 * 1- execute check dependencies workflow
 * 
 * 2- filter dependencies
 * 
*/
export const checkDependencies: Step<InstallWorkflowContext> = {
    name: 'check-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.installData.checks.noDependencies){
            Logger.log(`Skipping dependencies check (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check dependencies step', true);

        //1- execute check dependencies workflow
        const inputData: CheckPackageDependenciesActionInput = {
            packageData: {
                manifest: context.runtime.remotePackageData.manifest
            },
            contextData: {
                systemPackages: context.rawInput.contextData.systemPackages
            },
            printOptions: {
                dependencyStatus: false,
                information: false
            }
        };
        Logger.loading(`Checking dependencies...`);
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        const result = await CheckPackageDependenciesWkf(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
        if(result.dependencies.length > 0){
            if(result.dependencies.length === 1){
                Logger.info(`"${context.rawInput.packageData.name}" has ${result.dependencies.length} dependency: ${result.dependencyStatus.filter(o => o.match).length} installed, ${result.dependencyStatus.filter(o => !o.match).length} missing.`);
            }else{
                Logger.info(`"${context.rawInput.packageData.name}" has ${result.dependencies.length} dependencies: ${result.dependencyStatus.filter(o => o.match).length} installed, ${result.dependencyStatus.filter(o => !o.match).length} missing.`);
            }
        }

        //2- filter dependencies
        context.runtime.dependenciesToInstall = result.dependencyStatus.filter(o => !o.match).map(k => k.dependency);
    }
}