import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { desc } from "semver-sort";
import { satisfies } from "semver";
import { Lockfile } from "../../lockfile";

/**
 * Find release to install.
 * If lockfile is provided, checksum is tested and lockfile version is extracted, else the latest release in range is taken
 * 
 * 1- find version
 * 
*/
export const findInstallRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'find-install-release',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        Logger.log('Find install release step', true);

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