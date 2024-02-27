import { satisfies } from "semver";
import { LogTableStruct } from "../commons";
import { TrmManifestDependency } from "../manifest";
import { Registry } from "../registry";
import { TrmPackage } from "../trmPackage";
import { SystemConnector } from "../systemConnector";

export async function checkDependencies(data: {
    dependencies: TrmManifestDependency[],
    installedPackages?: TrmPackage[]
}): Promise<{
    requiredDependenciesTab?: LogTableStruct,
    missingDependencies: TrmManifestDependency[],
    installedDependencies: TrmManifestDependency[]
}> {
    const dependencies = data.dependencies || [];
    var requiredDependenciesTab: LogTableStruct;
    if (dependencies.length > 0) {
        //logger.info(`Package "${packageName}" has ${dependencies.length} dependencies.`);
        requiredDependenciesTab = {
            head: ['Dependency', 'Version', 'Registry'],
            data: []
        }
        dependencies.forEach(o => {
            requiredDependenciesTab.data.push([
                o.name,
                o.version,
                o.registry || 'public'
            ]);
        });
        //logger.table(tableHead, tableData);
    }
    const aSystemPackages = data.installedPackages || await SystemConnector.getInstalledPackages(true, true);
    var missingDependencies: TrmManifestDependency[] = [];
    var installedDependencies: TrmManifestDependency[] = [];
    for(const d of dependencies){
        const dependencyName = d.name;
        const dependencyVersionRange = d.version;
        const dependencyRegistry = new Registry(d.registry || 'public');
        const installedPackage = aSystemPackages.find(o => o.packageName === dependencyName && o.compareRegistry(dependencyRegistry));
        if(!installedPackage || !installedPackage.manifest){
            missingDependencies.push(d);
        }else{
            const installedPackageIntegrity = await SystemConnector.getPackageIntegrity(installedPackage);
            const installedVersion = installedPackage.manifest.get().version;
            if(!satisfies(installedVersion, dependencyVersionRange) || d.integrity !== installedPackageIntegrity){
                missingDependencies.push(d);
            }else{
                installedDependencies.push(d);
            }
        }
    }
    

    return {
        requiredDependenciesTab,
        installedDependencies,
        missingDependencies
    }
}