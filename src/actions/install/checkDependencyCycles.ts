import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { TrmManifest } from "../../manifest";
import { RegistryProvider } from "../../registry";
import { TrmPackage } from "../../trmPackage";
import { selectDependencyRelease } from "../installDependency/findInstallRelease";
import { getInstalledDependency } from "../commons/utils";

/**
 * Workflow step that rejects dependency cycles the install would recurse into, before anything
 * is installed. A dependency already installed in a compatible version is not installed again,
 * so it ends the walk on that branch. Any other dependency is resolved to the release a
 * dependency install would select (lockfile entry or newest release in range) and walked.
 *
 * 1- walk the dependency graph and abort on the first cycle
 *
*/
export const checkDependencyCycles: Step<InstallWorkflowContext> = {
    name: 'check-dependency-cycles',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.installData.checks.noDependencies){
            Logger.log(`Skipping dependency cycles check (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- walk the dependency graph and abort on the first cycle
        Logger.loading(`Checking dependency graph...`);
        const systemPackages = context.rawInput.contextData.systemPackages || [];
        const lockfile = context.rawInput.installData.checks.lockfile;
        const resolved: TrmPackage[] = [];

        const getManifest = async (trmPackage: TrmPackage, versionRange: string): Promise<TrmManifest> => {
            const release = await selectDependencyRelease(trmPackage, trmPackage.registry, versionRange, lockfile);
            return (await trmPackage.registry.getPackage(trmPackage.packageName, release.version)).manifest;
        };

        const visit = async (manifest: TrmManifest, path: TrmPackage[]): Promise<void> => {
            for (const dependency of manifest.dependencies || []) {
                const trmPackage = new TrmPackage(dependency.name, RegistryProvider.getRegistry(dependency.registry));
                if (getInstalledDependency(systemPackages, trmPackage, dependency.version).status === 'ok') {
                    continue;
                }
                const cycleStart = path.findIndex(o => TrmPackage.compare(o, trmPackage));
                if (cycleStart >= 0) {
                    const cycle = [...path.slice(cycleStart), trmPackage].map(o => `"${o.packageName}"`).join(' -> ');
                    throw new Error(`Install aborted: cyclic dependency detected ${cycle}.`);
                }
                if (resolved.some(o => TrmPackage.compare(o, trmPackage))) {
                    continue;
                }
                await visit(await getManifest(trmPackage, dependency.version), [...path, trmPackage]);
                resolved.push(trmPackage);
            }
        };

        await visit(
            context.runtime.package.data.manifest,
            [new TrmPackage(context.rawInput.packageData.name, context.rawInput.packageData.registry)]
        );
    }
}
