import { Inquirer } from "../inquirer";
import { Logger } from "../logger";
import { Registry, RegistryType } from "../registry";
import * as semver from "semver";
import * as semverSort from "semver-sort";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { Manifest, TrmManifest } from "../manifest";
import { install } from "./install";

export async function installDependency(data: {
    packageName: string,
    versionRange: string,
    integrity: string,
    installedPackages?: TrmPackage[],
    originalInstallOptions?: any
}, inquirer: Inquirer, system: SystemConnector, registry: Registry, logger: Logger) {
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
    const installedPackages = data.installedPackages || await system.getInstalledPackages();

    var alreadyInstalled: boolean = false;
    rangeVersions.forEach(o => {
        if (!alreadyInstalled) {
            const dummyManifest: TrmManifest = {
                name: packageName,
                version: o.version,
                registry: registry.getRegistryType() === RegistryType.PUBLIC ? undefined : registry.endpoint
            };
            const oDummyManifest = new Manifest(dummyManifest);
            alreadyInstalled = installedPackages.find(ip => Manifest.compare(ip.manifest, oDummyManifest, true)) ? true : false;
        }
    });
    if (alreadyInstalled && !forceInstall) {
        logger.info(`Dependency "${packageName}" already installed, skipping installation.`);
        return;
    }
    //proceed to the normal install flow
    const sortedVersions = semverSort.desc(rangeVersions.map(o => o.version));
    const version = sortedVersions[0];
    //keeping the original install options but overwriting package data
    await install({
        ...(data.originalInstallOptions || {}),
        ...{
            packageName,
            version,
            integrity
        }
    }, inquirer, system, registry, logger);
}