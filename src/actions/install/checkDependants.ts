import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { satisfies } from "semver";
import { InstallWorkflowContext } from ".";
import { RegistryProvider } from "../../registry";
import { TrmPackage } from "../../trmPackage";

/** Installed package declaring a dependency on another installed package. */
export type PackageDependant = {
    package: TrmPackage,
    /** Version range the dependant requires. */
    range: string
}

/** Lists the dependencies on `target` declared by the other installed packages. */
export function getDependants(systemPackages: TrmPackage[], target: TrmPackage): PackageDependant[] {
    return systemPackages.flatMap(systemPackage => {
        if (!systemPackage.manifest || TrmPackage.compare(systemPackage, target)) {
            return [];
        }

        return (systemPackage.manifest.get().dependencies || [])
            .filter(dependency => TrmPackage.compare(
                new TrmPackage(dependency.name, RegistryProvider.getRegistry(dependency.registry)),
                target
            ))
            .map(dependency => ({
                package: systemPackage,
                range: dependency.version
            }));
    });
}

/** Explains how to unblock an upgrade rejected by incompatible dependants. */
function logResolutionGuide(upgradedPackage: TrmPackage, upgradedVersion: string, incompatibleDependants: PackageDependant[], ranges: string[]): void {
    const target = `"${upgradedPackage.packageName}" v${upgradedVersion}`;
    const names = incompatibleDependants.map(dependant => `"${dependant.package.packageName}"`).join(', ');
    Logger.info(`How to upgrade to ${target}:`);
    Logger.info(`  1. Install a newer release of ${names} whose dependency on "${upgradedPackage.packageName}" accepts v${upgradedVersion}; installing it can also upgrade "${upgradedPackage.packageName}" as its dependency.`);
    Logger.info(`  2. If ${target} is still not installed, run this install again.`);
    Logger.info(`If no compatible release of ${names} is available, keep the current version or install a version of "${upgradedPackage.packageName}" that satisfies all dependant ranges (${[...new Set(ranges)].join(', ')}).`);
}

/**
 * Prevents an upgrade from breaking the declared ranges of installed dependant packages.
 */
export const checkDependants: Step<InstallWorkflowContext> = {
    name: 'check-dependants',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(!context.runtime.update){
            Logger.log(`Skipping check dependants check (no upgrade/downgrade)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const upgradedPackage = context.runtime.update;
        const upgradedVersion = context.runtime.package.data.manifest.version;
        const dependants = getDependants(context.rawInput.contextData.systemPackages, upgradedPackage).map(dependant => ({
            ...dependant,
            compatible: satisfies(upgradedVersion, dependant.range, { includePrerelease: true })
        }));

        if (dependants.length === 0) {
            Logger.info(`No installed packages depend on "${upgradedPackage.packageName}".`, true);
            return;
        }

        const incompatibleDependants = dependants.filter(dependant => !dependant.compatible);
        dependants
            .filter(dependant => dependant.compatible)
            .forEach(dependant => Logger.info(
                `Dependant "${dependant.package.packageName}" accepts "${upgradedPackage.packageName}" v${upgradedVersion} (${dependant.range}); no action needed.`
            ));

        if (incompatibleDependants.length === 0) {
            return;
        }

        incompatibleDependants.forEach(dependant => Logger.error(
            `Dependant "${dependant.package.packageName}" requires "${upgradedPackage.packageName}" ${dependant.range}, which does not accept v${upgradedVersion}.`
        ));
        logResolutionGuide(upgradedPackage, upgradedVersion, incompatibleDependants, dependants.map(dependant => dependant.range));
        throw new Error(`Upgrade aborted: incompatible dependant packages must be upgraded first.`);
    }
};
