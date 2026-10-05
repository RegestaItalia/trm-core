import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyEntry, InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { CheckPackageDependenciesActionInput, checkPackageDependencies as CheckPackageDependenciesWkf } from "../checkPackageDependencies";

/**
 * Workflow step that identifies missing or incompatible dependencies on the target system.
 * Incompatible dependencies are queued with their installed version, so they are not reported as missing.
 * 
 * 1- execute check dependencies workflow
 * 
 * 2- reject installed dependencies with an unreadable manifest
 * 
 * 3- filter dependencies
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
        //1- execute check dependencies workflow
        const inputData: CheckPackageDependenciesActionInput = {
            packageData: {
                manifest: context.runtime.package.data.manifest
            },
            contextData: {
                systemPackages: context.rawInput.contextData.systemPackages
            },
            printOptions: {
                dependencyStatus: false,
                information: false
            }
        };
        Logger.loading(`Checking package dependencies...`);
        const result = await CheckPackageDependenciesWkf(inputData);
        if(result.dependencies.length > 0){
            const installed = result.dependencyStatus.filter(o => o.status === 'ok').length;
            const missing = result.dependencyStatus.filter(o => o.status === 'notFound').length;
            const incompatible = result.dependencyStatus.filter(o => o.status === 'versionMismatch').length;
            const noun = result.dependencies.length === 1 ? 'dependency' : 'dependencies';
            Logger.info(`"${context.rawInput.packageData.name}" has ${result.dependencies.length} ${noun}: ${installed} installed, ${missing} missing, ${incompatible} incompatible.`);
        }

        //2- reject installed dependencies with an unreadable manifest
        const unreadable = result.dependencyStatus.filter(o => o.status === 'manifestUnreadable');
        if(unreadable.length > 0){
            throw new Error(`Cannot verify installed dependencies ${unreadable.map(o => `"${o.dependency.name}"`).join(', ')}: package is installed but its manifest is unreadable.`);
        }

        //3- filter dependencies
        context.runtime.dependencies = result.dependencyStatus
            .filter(o => o.status === 'notFound' || o.status === 'versionMismatch')
            .map(o => ({
                dependency: o.dependency,
                status: o.status as InstallDependencyEntry['status'],
                installedVersion: o.installedVersion
            }));
    }
}
