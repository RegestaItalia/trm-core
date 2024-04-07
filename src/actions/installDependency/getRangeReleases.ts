import { Step } from "@sammarks/workflow";
import { InstallDependencyWorkflowContext } from ".";
import { Manifest, TrmManifest } from "../../manifest";
import { RegistryType } from "../../registry";
import { TrmPackage } from "../../trmPackage";

export const getRangeReleases: Step<InstallDependencyWorkflowContext> = {
    name: 'get-range-releases',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const versionRange = context.parsedInput.versionRange;
        const registry = context.runtime.registry;
        const releases = await registry.getReleases(packageName, versionRange);
        if (releases.length === 0) {
            throw new Error(`Package "${packageName}", release not found in range "${versionRange}"`);
        }
        context.runtime.releases = releases;
        context.runtime.releasePackages = [];
        releases.forEach(o => {
            const dummyManifest: TrmManifest = {
                name: packageName,
                version: o.version,
                registry: registry.getRegistryType() === RegistryType.PUBLIC ? undefined : registry.endpoint
            };
            const oDummyManifest = new Manifest(dummyManifest);
            context.runtime.releasePackages.push(new TrmPackage(packageName, registry, oDummyManifest));
        });
    }
}