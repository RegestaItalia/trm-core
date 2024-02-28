import { Step } from "@sammarks/workflow";
import { FindDependenciesPublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { Registry } from "../../registry";
import { satisfies } from "semver";
import { SystemConnector } from "../../systemConnector";

export const analizeDependencies: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'analize-dependencies',
    filter: async (context: FindDependenciesPublishWorkflowContext): Promise<boolean> => {
        return context.parsedInput.systemPackages && context.parsedInput.systemPackages.length > 0;
    },
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        const dependencies = context.parsedInput.dependencies;
        const systemPackages = context.parsedInput.systemPackages;
        Logger.info(`Package ${context.parsedInput.packageName} has ${dependencies.length} TRM package dependencies.`, context.parsedInput.print);
        context.runtime.versionOkDependencies = [];
        context.runtime.versionKoDependencies = [];
        context.runtime.integrityOkDependencies = [];
        context.runtime.integrityKoDependencies = [];
        context.runtime.table = {
            head: ['Dependency', 'Registry', 'Dependency range', 'Version on system', 'Version status', 'Integrity status'],
            data: []
        };
        var tableData: string[];
        for(const dependency of dependencies){
            tableData = [dependency.name, dependency.registry || 'public', dependency.version];
            const dependencyTrmPackage = new TrmPackage(dependency.name, new Registry(dependency.registry));
            const systemInstalledPackage = systemPackages.find(o => TrmPackage.compare(o, dependencyTrmPackage));
            if(systemInstalledPackage && systemInstalledPackage.manifest){
                const installedVersion = systemInstalledPackage.manifest.get().version;
                tableData.push(installedVersion);
                if(satisfies(installedVersion, dependency.version)){
                    tableData.push('OK');
                    context.runtime.versionOkDependencies.push(dependency);
                }else{
                    tableData.push('ERR!');
                    context.runtime.versionKoDependencies.push(dependency);
                }
            }else{
                tableData.push('Not found');
                tableData.push('ERR!');
                context.runtime.versionKoDependencies.push(dependency);
            }
            try{
                const installedPackageIntegrity = await SystemConnector.getPackageIntegrity(systemInstalledPackage);
                if(installedPackageIntegrity === dependency.integrity){
                    tableData.push('Safe');
                    context.runtime.integrityOkDependencies.push(dependency);
                }else{
                    tableData.push('Unsafe');
                    context.runtime.integrityKoDependencies.push(dependency);
                }
            }catch(e){
                tableData.push('Unknown');
                context.runtime.integrityKoDependencies.push(dependency);
                Logger.error(e.toString(), true);
                Logger.error(`Couldn't retrieve package integrity`, true);
            }
            context.runtime.table.data.push(tableData);
        }
        Logger.table(context.runtime.table.head, context.runtime.table.data, context.parsedInput.print);
    }
}