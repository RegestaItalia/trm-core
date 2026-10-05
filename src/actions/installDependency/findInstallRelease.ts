import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { InstallDependencyWorkflowContext } from ".";
import { desc } from "semver-sort";
import { satisfies } from "semver";
import { Lock, Lockfile } from "../../lockfile";
import { AbstractRegistry } from "../../registry";
import { TrmPackage } from "../../trmPackage";

/**
 * Selects the dependency release a dependency install would use: the lockfile entry when the
 * lockfile has one, otherwise the newest registry release satisfying the range.
 * The lock integrity is not verified here.
 * @throws When the lockfile entry is outside the range, or no registry release satisfies it.
 */
export async function selectDependencyRelease(
    trmPackage: TrmPackage,
    registry: AbstractRegistry,
    versionRange: string,
    lockfile?: Lockfile
): Promise<{ version: string, lock?: Lock }> {
    const lock = lockfile?.getLock(trmPackage, versionRange);
    if (lock) {
        return { version: lock.version, lock };
    }
    const packageData = await registry.getPackage(trmPackage.packageName, 'latest');
    const versions = packageData.versions.filter(v => satisfies(v, versionRange));
    if (versions.length === 0) {
        throw new Error(`Dependency "${trmPackage.packageName}": releases not found in range ${versionRange}.`);
    }
    return { version: desc(versions)[0] };
}

/**
 * Workflow step that selects the dependency release to install.
 * If a lockfile entry exists, its integrity is verified and its version is used; otherwise,
 * including when the lockfile has no entry for the dependency, the newest registry release
 * satisfying the requested semantic-version range is selected.
 * Registry prereleases are selected only when the range opts in (semver default); installed and
 * locked prereleases are matched with `includePrerelease`.
 *
 * 1- find version
 *
*/
export const findInstallRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'find-install-release',
    filter: async (context: InstallDependencyWorkflowContext): Promise<boolean> => !context.runtime.alreadyInstalled,
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        //1- find version
        const release = await selectDependencyRelease(
            context.runtime.trmPackage,
            context.rawInput.dependencyDataPackage.registry,
            context.rawInput.dependencyDataPackage.versionRange,
            context.rawInput.installData.checks.lockfile
        );
        if (context.rawInput.installData.checks.lockfile && !release.lock) {
            Logger.info(`Dependency "${context.rawInput.dependencyDataPackage.name}" not in lockfile, using v${release.version} (${context.rawInput.dependencyDataPackage.versionRange}).`);
        }
        if (release.lock && !(await Lockfile.testReleaseByLock(release.lock))) {
            throw new Error(`Cannot continue due to security issues.`);
        }
        context.runtime.installVersion = release.version;
        context.runtime.installIntegrity = release.lock?.integrity;
    }
}
