import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { satisfies } from "semver";
import { InstallWorkflowContext } from ".";
import { RegistryProvider } from "../../registry";
import { TrmPackage } from "../../trmPackage";

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
        const dependants = context.rawInput.contextData.systemPackages.flatMap(systemPackage => {
            if (!systemPackage.manifest || TrmPackage.compare(systemPackage, upgradedPackage)) {
                return [];
            }

            return (systemPackage.manifest.get().dependencies || [])
                .filter(dependency => TrmPackage.compare(
                    new TrmPackage(dependency.name, RegistryProvider.getRegistry(dependency.registry)),
                    upgradedPackage
                ))
                .map(dependency => ({
                    package: systemPackage,
                    range: dependency.version,
                    compatible: satisfies(upgradedVersion, dependency.version)
                }));
        });

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
        throw new Error(`Upgrade aborted: incompatible dependant packages must be upgraded first.`);
    }
};
