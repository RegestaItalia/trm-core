import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";
import { Registry, RegistryType } from "../../registry";


export const setTrmDependencies: Step<WorkflowContext> = {
    name: 'set-trm-dependencies',
    filter: async (context: WorkflowContext): Promise<boolean> => {
        const trmDependencies = (context.runtime.dependencies || []).filter(o => o.trmPackage);
        if (trmDependencies.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping TRM dependencies search beacuse no TRM packages were found`, true);
            return false;
        }
    },
    run: async (context: WorkflowContext): Promise<void> => {
        const trmDependencies = (context.runtime.dependencies || []).filter(o => o.trmPackage);
        trmDependencies.forEach(d => {
            const dependencyManifest = d.trmPackage.manifest.get();
            const dependencyName = dependencyManifest.name;
            const dependencyVersion = `^${dependencyManifest.version}`;
            const dependencyIntegrity = d.integrity;
            const dependencyRegistry = d.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? undefined : d.trmPackage.registry.endpoint;
            var arrayIndex = context.runtime.manifest.dependencies.findIndex(o => o.name === dependencyName);
            if (arrayIndex < 0) {
                arrayIndex = context.runtime.manifest.dependencies.push({
                    name: dependencyName,
                    version: dependencyVersion,
                    integrity: dependencyIntegrity,
                    registry: dependencyRegistry
                });
                arrayIndex--;
            }
            //is this necessary?
            context.runtime.manifest.dependencies[arrayIndex].version = dependencyVersion;
            context.runtime.manifest.dependencies[arrayIndex].integrity = dependencyIntegrity;
            if (Registry.compare(d.trmPackage.registry, context.runtime.registry)) {
                Logger.info(`Found dependency with package "${dependencyName}", version "${dependencyVersion}"`);
            } else {
                const dependencyRegistryName = d.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : d.trmPackage.registry.endpoint;
                Logger.info(`Found dependency with package "${dependencyName}", version "${dependencyVersion}", registry "${dependencyRegistryName}"`)
            }
            if (!dependencyIntegrity) {
                throw new Error(`Dependency "${dependencyName}", package integrity not found.`);
            }
        });
    }
}