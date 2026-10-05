import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependenciesWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { TrmPackage } from "../../trmPackage";
import { PUBLIC_RESERVED_KEYWORD, RegistryProvider } from "../../registry";
import { getInstalledDependency } from "../commons/utils";

/**
 * Workflow step that compares manifest dependency ranges with installed package versions.
 * 
 * 1- build required tables fields
 * 
 * 2- check dependencies
 * 
 * 3- print tables
 * 
*/
export const analyze: Step<CheckPackageDependenciesWorkflowContext> = {
    name: 'analyze',
    filter: async (context: CheckPackageDependenciesWorkflowContext): Promise<boolean> => {
        if(context.output.dependencies.length > 0){
            return true;
        }else{
            Logger.info(`Package ${context.rawInput.packageData.manifest.name} has no TRM package dependencies`, !context.rawInput.printOptions.information);
            return false;
        }
    },
    run: async (context: CheckPackageDependenciesWorkflowContext): Promise<void> => {
        Logger.info(`Package ${context.rawInput.packageData.manifest.name} has ${context.output.dependencies.length} TRM package dependencies`, !context.rawInput.printOptions.information);
        
        //1- build required tables fields
        var table = {
            header: ['Dependency', 'Registry', 'Dependency range', 'Version on system', 'Version status'],
            data: []
        };

        //2- check dependencies
        var tableData: string[];
        for(const dependency of context.output.dependencies){
            tableData = [dependency.name, dependency.registry || PUBLIC_RESERVED_KEYWORD, dependency.version];
            const dependencyTrmPackage = new TrmPackage(dependency.name, RegistryProvider.getRegistry(dependency.registry));
            const installed = getInstalledDependency(context.rawInput.contextData.systemPackages, dependencyTrmPackage, dependency.version);
            const status = installed.status;
            if(status === 'notFound'){
                tableData.push('Not found');
            }else if(status === 'manifestUnreadable'){
                if(installed.error){
                    Logger.error(installed.error.toString(), true);
                }
                tableData.push('Installed, manifest unreadable');
            }else{
                tableData.push(installed.installedVersion);
            }
            const match = status === 'ok';
            tableData.push(match ? 'OK' : 'ERR!');
            if(match){
                context.runtime.dependenciesStatus.goodVersion.push(dependency);
            }else{
                context.runtime.dependenciesStatus.badVersion.push(dependency);
            }
            context.output.dependencyStatus.push({
                dependency,
                match,
                status,
                installedVersion: installed.installedVersion
            });
            table.data.push(tableData);
        }

        //3- print tables
        Logger.table(table.header, table.data, !context.rawInput.printOptions.dependencyStatus);
    }
}
