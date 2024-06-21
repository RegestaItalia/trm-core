import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "../../logger";
import { desc } from "semver-sort";
import { TrmPackage } from "../../trmPackage";
import { createHash } from "crypto";

export const findInstallRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'find-install-release',
    filter: async (context: InstallDependencyWorkflowContext): Promise<boolean> => {
        if (context.runtime.skipInstall) {
            Logger.log(`Skipping find install release (skipInstall)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const releases = context.runtime.releases;
        const aPackages = context.runtime.releasePackages;
        const integrity = context.parsedInput.integrity;
        var version: string;
        //with integrity, keep the only package that matches checksum
        const sortedVersions = desc(releases.map(o => o.version));
        var aSortedPackages: TrmPackage[] = [];
        for (const v of sortedVersions) {
            aSortedPackages = aSortedPackages.concat(aPackages.filter(o => o.manifest.get().version === v));
        }
        if (integrity) {
            for (const oPackage of aSortedPackages) {
                if (!version) {
                    const oArtifact = await oPackage.fetchRemoteArtifact(oPackage.manifest.get().version);
                    const fetchedIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
                    if (integrity === fetchedIntegrity) {
                        version = oPackage.manifest.get().version;
                    }
                }
            }
        } else {
            if(sortedVersions.length > 0){
                version = sortedVersions[0];
            }
        }
        if (!version) {
            throw new Error(`Couldn't find dependency "${packageName}" on registry. Try manual install.`);
        }
        context.output.version = version;
    }
}