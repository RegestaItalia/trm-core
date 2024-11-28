import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependenciesWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { PUBLIC_RESERVED_KEYWORD, Registry } from "../../registry";
import { satisfies } from "semver";
import { SystemConnector } from "../../systemConnector";

/**
 * Analyze
 * 
 * 1- build required tables fields
 * 
 * 2- check dependencies
 * 
 * 3- print tables
 * 
 * 4- build output data
 * 
*/
export const analyze: Step<CheckPackageDependenciesWorkflowContext> = {
    name: 'analyze',
    filter: async (context: CheckPackageDependenciesWorkflowContext): Promise<boolean> => {
        if(context.output.dependencies.length > 0){
            return true;
        }else{
            Logger.info(`Package ${context.rawInput.packageData.package.packageName} has no TRM package dependencies`, !context.rawInput.printOptions.information);
            return false;
        }
    },
    run: async (context: CheckPackageDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Analyze step', true);

        Logger.info(`Package ${context.rawInput.packageData.package.packageName} has ${context.output.dependencies.length} TRM package dependencies`, !context.rawInput.printOptions.information);
        
        //1- build required tables fields
        var table = {
            header: ['Dependency', 'Registry', 'Dependency range', 'Version on system', 'Version status', 'Integrity status'],
            data: []
        };

        //2- check dependencies
        var tableData: string[];
        for(const dependency of context.output.dependencies){
            tableData = [dependency.name, dependency.registry || PUBLIC_RESERVED_KEYWORD, dependency.version];
            const dependencyTrmPackage = new TrmPackage(dependency.name, new Registry(dependency.registry || PUBLIC_RESERVED_KEYWORD));
            const systemInstalledPackage = context.rawInput.contextData.systemPackages.find(o => TrmPackage.compare(o, dependencyTrmPackage));
            if(systemInstalledPackage && systemInstalledPackage.manifest){
                const installedVersion = systemInstalledPackage.manifest.get().version;
                tableData.push(installedVersion);
                if(satisfies(installedVersion, dependency.version)){
                    tableData.push('OK');
                    context.runtime.dependenciesStatus.goodVersion.push(dependency);
                }else{
                    tableData.push('ERR!');
                    context.runtime.dependenciesStatus.badVersion.push(dependency);
                }
            }else{
                tableData.push('Not found');
                tableData.push('ERR!');
                context.runtime.dependenciesStatus.badVersion.push(dependency);
            }
            try{
                const installedPackageIntegrity = await SystemConnector.getPackageIntegrity(systemInstalledPackage);
                if(installedPackageIntegrity === dependency.integrity){
                    tableData.push('Safe');
                    context.runtime.dependenciesStatus.goodIntegrity.push(dependency);
                }else{
                    tableData.push('Unsafe');
                    context.runtime.dependenciesStatus.badIntegrity.push(dependency);
                }
            }catch(e){
                tableData.push('Unknown');
                context.runtime.dependenciesStatus.badIntegrity.push(dependency);
                Logger.error(e.toString(), true);
                Logger.error(`Couldn't retrieve package integrity`, true);
            }
            table.data.push(tableData);
        }

        //3- print tables
        Logger.table(table.header, table.data, !context.rawInput.printOptions.dependencyStatus);

        //4- build output data
        context.runtime.dependenciesStatus.goodVersion.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].match = true;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: true,
                    safe: null
                });
            }
        });
        context.runtime.dependenciesStatus.badVersion.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].match = false;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: false,
                    safe: null
                });
            }
        });
        context.runtime.dependenciesStatus.goodIntegrity.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].safe = true;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: null,
                    safe: true
                });
            }
        });
        context.runtime.dependenciesStatus.badIntegrity.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].safe = false;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: null,
                    safe: false
                });
            }
        });
    }
}