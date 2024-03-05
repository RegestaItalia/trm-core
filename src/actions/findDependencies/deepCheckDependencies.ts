
import { Step } from "@sammarks/workflow";
import { DependencyTreeBranch, FindDependenciesPublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { TrmManifestDependency } from "../../manifest";
import { Registry } from "../../registry";

const _getDependenciesFromTrmManifestDependency = (trmManifestDependency: TrmManifestDependency, systemPackages: TrmPackage[], avoidDependency: TrmPackage[]): DependencyTreeBranch => {
    const dummyPackage = new TrmPackage(trmManifestDependency.name, new Registry(trmManifestDependency.registry || 'public'));
    const trmPackage = systemPackages.find(o => TrmPackage.compare(o, dummyPackage));
    if (trmPackage) {
        var dependencies: DependencyTreeBranch[] = [];
        if (!avoidDependency.find(o => TrmPackage.compare(o, trmPackage))) {
            avoidDependency.push(trmPackage);
            dependencies = _getDependenciesFromTrmPackage(trmPackage, systemPackages, avoidDependency);
        }else{
            const manifest = trmPackage.manifest;
            if(manifest){
                const manifestDependencies = manifest.get().dependencies || [];
                manifestDependencies.forEach(o => {
                    const manifestDependencyDummy = new TrmPackage(o.name, new Registry(o.registry || 'public')); 
                    dependencies.push({
                        packageName: o.name,
                        trmPackage: systemPackages.find(o => TrmPackage.compare(o, manifestDependencyDummy)),
                        dependencies: [],
                        circular: true
                    });
                })
            }
        }
        return {
            packageName: trmPackage.packageName,
            trmPackage,
            dependencies,
            circular: false
        };
    }
}

const _getDependenciesFromTrmPackage = (trmPackage: TrmPackage, systemPackages: TrmPackage[], avoidDependency: TrmPackage[]): DependencyTreeBranch[] => {
    var dependencyTreeBranches: DependencyTreeBranch[] = [];
    const manifest = trmPackage.manifest;
    if (manifest) {
        const dependencies = manifest.get().dependencies || [];
        dependencies.forEach(d => {
            dependencyTreeBranches = dependencyTreeBranches.concat(_getDependenciesFromTrmManifestDependency(d, systemPackages, avoidDependency));
        });
    }
    return dependencyTreeBranches;
}

export const deepCheckDependencies: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'deep-check-dependencies',
    filter: async (context: FindDependenciesPublishWorkflowContext): Promise<boolean> => {
        if (context.rawInput.deepCheck) {
            const trmDependencies = context.runtime.trmPackageDependencies;
            if (trmDependencies.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping deep check beacuse no TRM packages were found`, true);
                return false;
            }
        } else {
            Logger.log(`Skipping deep check (input)`, true);
            return false;
        }
    },
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        const systemPackages = context.parsedInput.systemPackages;
        const trmDependencies = context.runtime.trmPackageDependencies;
        var dependencyTreeBranches: DependencyTreeBranch[] = [];
        trmDependencies.forEach(d => {
            dependencyTreeBranches = dependencyTreeBranches.concat(_getDependenciesFromTrmPackage(d, systemPackages, [d]));
        });
        context.output.tree = {
            devclass: context.parsedInput.devclass,
            dependencies: dependencyTreeBranches
        };
    }
}