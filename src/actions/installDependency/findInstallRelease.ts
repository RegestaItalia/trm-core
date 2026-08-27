import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { desc } from "semver-sort";
import { satisfies } from "semver";
import { Lockfile } from "../../lockfile";

/**
 * Workflow step that selects the dependency release to install.
 * If a lockfile entry exists, its integrity is verified and its version is used; otherwise
 * the newest registry release satisfying the requested semantic-version range is selected.
 * 
 * 1- find version
 * 
*/
export const findInstallRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'find-install-release',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        //1- find version
        const lock = context.rawInput.installData.checks.lockfile ? context.rawInput.installData.checks.lockfile.getLock(context.runtime.trmPackage, context.rawInput.dependencyDataPackage.versionRange) : null;
        if (lock) {
            const testLock = await Lockfile.testReleaseByLock(lock);
            if(!testLock){
                throw new Error(`Cannot continue due to security issues.`);
            }else{
                context.runtime.installVersion = lock.version;
            }
        } else {
            const packageData = await context.rawInput.dependencyDataPackage.registry.getPackage(context.rawInput.dependencyDataPackage.name, 'latest');
            const versions = packageData.versions.filter(v => satisfies(v, context.rawInput.dependencyDataPackage.versionRange));
            if (versions.length === 0) {
                throw new Error(`Dependency "${context.rawInput.dependencyDataPackage.name}": releases not found in range ${context.rawInput.dependencyDataPackage.versionRange}.`);
            } else {
                context.runtime.installVersion = desc(versions)[0];
            }
        }
    }
}
