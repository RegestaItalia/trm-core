import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { desc } from "semver-sort";
import { TrmPackage } from "../../trmPackage";
import { createHash } from "crypto";

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
        const releases = await context.rawInput.dependencyDataPackage.registry.getReleases(context.rawInput.dependencyDataPackage.name, context.rawInput.dependencyDataPackage.versionRange);
        if (releases.length === 0) {
            throw new Error(`Dependency "${context.rawInput.dependencyDataPackage.name}": releases not found in range ${context.rawInput.dependencyDataPackage.versionRange}.`);
        }
        
        const sortedVersions = desc(releases.map(o => o.version));
        if(context.rawInput.installData.checks && context.rawInput.installData.checks.safe){
            if(context.rawInput.dependencyDataPackage.integrity){
                //3- find matching integrity release (if provided)
                for(const sortedVersion of sortedVersions){
                    if(!context.runtime.installVersion){
                        const oArtifact = await new TrmPackage(context.rawInput.dependencyDataPackage.name, context.rawInput.dependencyDataPackage.registry).fetchRemoteArtifact(sortedVersion);
                        const fetchedIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
                        if (context.rawInput.dependencyDataPackage.integrity === fetchedIntegrity) {
                            context.runtime.installVersion = sortedVersion;
                        }
                    }
                }
            }else{
                throw new Error(`Running in safe mode but no integrity was provided for dependency "${context.rawInput.dependencyDataPackage.name}" install.`);
            }
        }else{
            context.runtime.installVersion = sortedVersions[0];
        }
    }
}