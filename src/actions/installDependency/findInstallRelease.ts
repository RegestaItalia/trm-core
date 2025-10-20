import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { desc } from "semver-sort";
import { satisfies } from "semver";

/**
 * Find release in range to install
 * 
 * 1- get releases in range from registry
 * 
 * 2- sort releases
 * 
 * 3- find matching integrity release (if provided)
 * 
*/
export const findInstallRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'find-install-release',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        Logger.log('Find install release step', true);

        //1- get releases in range from registry
        const packageData = await context.rawInput.dependencyDataPackage.registry.getPackage(context.rawInput.dependencyDataPackage.name, 'latest');
        const versions = packageData.versions.filter(v => satisfies(v, context.rawInput.dependencyDataPackage.versionRange));
        const yanked = packageData.yanked_versions.filter(v => satisfies(v, context.rawInput.dependencyDataPackage.versionRange));

        if (context.rawInput.dependencyDataPackage.integrity) {
            //3- find matching integrity release (if provided)
            const sortedVersions = desc(versions.concat(yanked));
            for (const sortedVersion of sortedVersions) {
                if (!context.runtime.installVersion) {
                    try {
                        const packageVersion = await context.rawInput.dependencyDataPackage.registry.getPackage(context.rawInput.dependencyDataPackage.name, sortedVersion);
                        if (context.rawInput.dependencyDataPackage.integrity === packageVersion.checksum) {
                            context.runtime.installVersion = sortedVersion;
                        }
                    } catch { }
                }
            }
        } else {
            if (versions.length === 0) {
                throw new Error(`Dependency "${context.rawInput.dependencyDataPackage.name}": releases not found in range ${context.rawInput.dependencyDataPackage.versionRange}.`);
            } else {
                context.runtime.installVersion = desc(versions)[0];
            }
        }
    }
}