import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { TrmManifest } from "../../manifest";
import { RegistryProvider } from "../../registry";
import { TrmPackage } from "../../trmPackage";
import { selectDependencyRelease } from "../installDependency/findInstallRelease";
import { getInstalledDependency } from "../commons/utils";
import { satisfies } from "semver";

/** Version a package of the dependency graph ends up with: the release to install or the installed one kept. */
type PlannedDependency = {
    trmPackage: TrmPackage,
    version: string,
    /** The installed release is kept. */
    kept: boolean,
    /** Package whose dependency planned it, and its range. */
    requiredBy: string,
    versionRange: string
}

/**
 * Workflow step that rejects dependency cycles and version conflicts the install would run into,
 * before anything is locked or installed. A dependency already installed in a compatible version is
 * not installed again, so it ends the walk on that branch. Any other dependency is resolved to the
 * release a dependency install would select (lockfile entry or newest release in range) and walked.
 * The walk follows the install order: the first package reaching a dependency decides its version,
 * and a later range that version doesn't satisfy is a conflict, which would otherwise fail midway,
 * after earlier dependencies were installed.
 *
 * 1- walk the dependency graph and abort on the first cycle or version conflict
 *
 * 2- abort when a replaced dependency no longer satisfies another installed package
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
        //1- walk the dependency graph and abort on the first cycle or version conflict
        Logger.loading(`Checking dependency graph...`);
        const systemPackages = context.rawInput.contextData.systemPackages || [];
        const lockfile = context.rawInput.installData.checks.lockfile;
        const root = new TrmPackage(context.rawInput.packageData.name, context.rawInput.packageData.registry);
        //completely walked dependencies (a dependency still being walked is on the path)
        const planned: PlannedDependency[] = [];

        const visit = async (manifest: TrmManifest, path: TrmPackage[]): Promise<void> => {
            const requiredBy = path[path.length - 1].packageName;
            for (const dependency of manifest.dependencies || []) {
                const trmPackage = new TrmPackage(dependency.name, RegistryProvider.getRegistry(dependency.registry));
                const plan = planned.find(o => TrmPackage.compare(o.trmPackage, trmPackage));
                if (plan) {
                    if (!satisfies(plan.version, dependency.version, { includePrerelease: true })) {
                        throw new Error(`Install aborted: dependency "${trmPackage.packageName}" version conflict: "${plan.requiredBy}" requires ${plan.versionRange} (v${plan.version} ${plan.kept ? 'installed' : 'to install'}), "${requiredBy}" requires ${dependency.version}.`);
                    }
                    continue;
                }
                const installed = getInstalledDependency(systemPackages, trmPackage, dependency.version);
                if (installed.status === 'ok') {
                    //the package being installed changes version: it is not planned
                    if (!TrmPackage.compare(trmPackage, root)) {
                        planned.push({ trmPackage, version: installed.installedVersion, kept: true, requiredBy, versionRange: dependency.version });
                    }
                    continue;
                }
                const cycleStart = path.findIndex(o => TrmPackage.compare(o, trmPackage));
                if (cycleStart >= 0) {
                    const cycle = [...path.slice(cycleStart), trmPackage].map(o => `"${o.packageName}"`).join(' -> ');
                    throw new Error(`Install aborted: cyclic dependency detected ${cycle}.`);
                }
                const release = await selectDependencyRelease(trmPackage, trmPackage.registry, dependency.version, lockfile);
                const releaseManifest = (await trmPackage.registry.getPackage(trmPackage.packageName, release.version)).manifest;
                await visit(releaseManifest, [...path, trmPackage]);
                planned.push({ trmPackage, version: release.version, kept: false, requiredBy, versionRange: dependency.version });
            }
        };

        await visit(context.runtime.package.data.manifest, [root]);

        //2- a dependency installed in another version must still satisfy the other installed packages requiring it
        const changed = planned.filter(plan => !plan.kept);
        for (const installedPackage of systemPackages) {
            if (TrmPackage.compare(installedPackage, root) || changed.some(plan => TrmPackage.compare(plan.trmPackage, installedPackage))) {
                continue;
            }
            for (const dependency of installedPackage.manifest?.get()?.dependencies || []) {
                const plan = changed.find(o => TrmPackage.compare(o.trmPackage, new TrmPackage(dependency.name, RegistryProvider.getRegistry(dependency.registry))));
                if (plan && getInstalledDependency(systemPackages, plan.trmPackage, plan.versionRange).status !== 'notFound'
                    && !satisfies(plan.version, dependency.version, { includePrerelease: true })) {
                    throw new Error(`Install aborted: dependency "${plan.trmPackage.packageName}" would be replaced with v${plan.version}, but installed package "${installedPackage.packageName}" requires ${dependency.version}. Upgrade "${installedPackage.packageName}" first.`);
                }
            }
        }
    }
}
