import { Inquirer } from "../inquirer";
import { Logger } from "../logger";
import { Registry, RegistryType } from "../registry";
import * as semver from "semver";
import * as semverSort from "semver-sort";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { Manifest, TrmManifest } from "../manifest";
import { install } from "./install";
import { createHash } from "crypto";

export async function installDependency(data: {
    packageName: string,
    versionRange: string,
    integrity: string,
    installedPackages?: TrmPackage[],
    originalInstallOptions?: any
}, inquirer: Inquirer, registry: Registry) {
    //this command is similar to install, however it's dedicated to dependencies
    //it shouldn't be used outside the install package flow
    const packageName = data.packageName;
    const versionRange = semver.validRange(data.versionRange);
    const integrity = data.integrity;
    const forceInstall = data.originalInstallOptions ? (data.originalInstallOptions.forceInstall ? true : false) : false;
    if (!versionRange) {
        throw new Error(`Dependency "${packageName}", invalid version range.`);
    }
    const rangeVersions = await registry.getReleases(packageName, versionRange);
    if(rangeVersions.length === 0){
        throw new Error(`Package "${packageName}", release not found in range ${versionRange}`);
    }
    const installedPackages = data.installedPackages || await SystemConnector.getInstalledPackages(true, true);

    var aPackages: TrmPackage[] = [];
    rangeVersions.forEach(o => {
        const dummyManifest: TrmManifest = {
            name: packageName,
            version: o.version,
            registry: registry.getRegistryType() === RegistryType.PUBLIC ? undefined : registry.endpoint
        };
        const oDummyManifest = new Manifest(dummyManifest);
        aPackages.push(new TrmPackage(packageName, registry, oDummyManifest));
    })

    var alreadyInstalled: boolean = false;
    aPackages.forEach(o => {
        if (!alreadyInstalled) {
            alreadyInstalled = installedPackages.find(ip => Manifest.compare(ip.manifest, o.manifest, true)) ? true : false;
        }
    });
    if (alreadyInstalled && !forceInstall) {
        Logger.info(`Dependency "${packageName}" already installed, skipping installation.`);
        return;
    }

    var version: string;
    //with integrity, keep the only package that matches checksum
    const sortedVersions = semverSort.desc(rangeVersions.map(o => o.version));
    var aSortedPackages: TrmPackage[] = [];
    for(const v of sortedVersions){
        aSortedPackages = aSortedPackages.concat(aPackages.filter(o => o.manifest.get().version === v));
    }
    if(integrity){
        for(const oPackage of aSortedPackages){
            if(!version){
                const oArtifact = await oPackage.fetchRemoteArtifact(oPackage.manifest.get().version);
                const fetchedIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
                if(integrity === fetchedIntegrity){
                    version = oPackage.manifest.get().version;
                }
            }
        }
    }else{
        version = sortedVersions[0];
    }
    if(!version){
        throw new Error(`Couldn't find dependency "${packageName}" on registry. Try manual install.`);
    }
    
    //proceed to the normal install flow
    //keeping the original install options but overwriting package data
    await install({
        ...(data.originalInstallOptions || {}),
        ...{
            packageName,
            version,
            integrity,
            safe: integrity ? true : false
        }
    }, inquirer, registry);
}