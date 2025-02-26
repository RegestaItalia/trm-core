
import { getCoreTrmDependencies } from "./getCoreTrmDependencies";
import { Registry } from "../registry";
import { TrmPackage } from "../trmPackage";
import { SystemConnector } from "../systemConnector";
import { satisfies } from "semver";

export type CheckTrmDependencies = {
    missingDependencies: string[],
    versionNotSatisfiedDependencies: TrmPackage[],
    dependencies: TrmPackage[]
};

export async function checkCoreTrmDependencies(systemPackages?: TrmPackage[]): Promise<CheckTrmDependencies> {
    var returnData: CheckTrmDependencies = {
        dependencies: [],
        versionNotSatisfiedDependencies: [],
        missingDependencies: []
    };
    const trmDependencies = getCoreTrmDependencies();
    if (trmDependencies && Object.keys(trmDependencies).length > 0) {
        const oPublicRegistry = new Registry('public');
        if(!systemPackages){
            systemPackages = await SystemConnector.getInstalledPackages(true);
        }
        Object.keys(trmDependencies).forEach(packageName => {
            const versionRange = trmDependencies[packageName];
            const installedPackage = systemPackages.find(o => o.packageName === packageName && o.compareRegistry(oPublicRegistry));
            if (!installedPackage || !installedPackage.manifest) {
                returnData.missingDependencies.push(packageName);
            } else {
                const installedVersion = installedPackage.manifest.get().version;
                if (!satisfies(installedVersion, versionRange)) {
                    returnData.versionNotSatisfiedDependencies.push(installedPackage);
                } else {
                    returnData.dependencies.push(installedPackage);
                }
            }
        });
    }
    return returnData;
}