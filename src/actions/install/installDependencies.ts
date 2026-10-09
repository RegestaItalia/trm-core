import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { InstallDependencyActionInput, installDependency as InstallDependencyWkf } from ".."
import { Manifest } from "../../manifest";
import { RegistryProvider } from "../../registry";
import { TrmPackage } from "../../trmPackage";
import * as _ from "lodash";
import { installWithRollback } from ".";

/**
 * Workflow step that installs each dependency missing from the target system or installed in an
 * incompatible version. A downgrade is confirmed by the dependency install; a dependency found
 * already installed there is skipped without a rollback. Every package a dependency install
 * installed, transitive ones included, is merged into the package snapshot, so a later dependency
 * sharing it (diamond) finds it installed.
 * 
 * 1- list dependencies to install
 * 
 * 2- prompt install
 * 
 * 3- run install workflow for each dependency
 * 
*/
export const installDependencies: Step<InstallWorkflowContext> = {
    name: 'install-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.dependencies.length > 0){
            return true;
        }else{
            Logger.log(`Skipping dependencies install (no packages to install)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- list dependencies to install
        const total = context.runtime.dependencies.length;
        Logger.info(total === 1 ? `There is 1 dependency to install:` : `There are ${total} dependencies to install:`);
        context.runtime.dependencies.forEach((o, i) => {
            if(o.status === 'versionMismatch'){
                Logger.info(`  ${i+1}/${total} ${o.dependency.name} ${o.dependency.version} (incompatible: v${o.installedVersion} installed)`);
            }else{
                Logger.info(`  ${i+1}/${total} ${o.dependency.name} ${o.dependency.version} (missing)`);
            }
        });

        //2- prompt install (not again for dependencies a parent install already confirmed)
        let confirmInstall = true;
        const approved = context.rawInput.installData.approvedDependencies || [];
        const alreadyApproved = context.runtime.dependencies.every(o => approved.includes(o.dependency.name));
        if (alreadyApproved) {
            Logger.log(`Dependencies already confirmed by the parent install`, true);
        } else if(!context.rawInput.contextData.noInquirer){
            confirmInstall = (await Inquirer.prompt({
                type: 'confirm',
                default: true,
                message: context.runtime.dependencies.some(o => o.status === 'versionMismatch') ? `Install or replace dependencies?` : `Install missing dependencies?`,
                name: 'confirmInstall'
            })).confirmInstall;
        }
        if(!confirmInstall){
            throw new Error(`Install aborted.`);
        }

        //3- run install workflow for each dependency
        context.runtime.systemPackagesBeforeDependencies = [...context.rawInput.contextData.systemPackages];
        let counter = 0;
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        for(const { dependency } of context.runtime.dependencies){
            counter++;
            Logger.loading(`Getting ready to install dependency "${dependency.name}"...`);
            const prefix = `(${counter}/${context.runtime.dependencies.length}) `;
            try {
                if(originalLPrefix){
                    Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
                }else{
                    Logger.setPrefix(`  ${prefix}`);
                }
                if(originalIPrefix){
                    Inquirer.setPrefix(`${originalIPrefix}-> ${prefix}`);
                }else{
                    Inquirer.setPrefix(`  ${prefix}`);
                }
                const dependencyRegistry = RegistryProvider.getRegistry(dependency.registry);
                const inputData: InstallDependencyActionInput = {
                    dependencyDataPackage: {
                        name: dependency.name,
                        versionRange: dependency.version,
                        registry: dependencyRegistry
                    },
                    contextData: _.cloneDeep(context.rawInput.contextData),
                    installData: _.cloneDeep(context.rawInput.installData)
                };
                inputData.installData.approvedDependencies = [...new Set([...approved, ...context.runtime.dependencies.map(o => o.dependency.name)])];
                delete inputData.installData.installDevclass.keepOriginal; //force input value if inquirer allows
                //the parent's mappings were resolved for its own devclasses: the dependency resolves its own
                inputData.installData.installDevclass.replacements = [];
                //on upgrade, the dependency must see the parent's new requirements, not the installed ones
                if (context.runtime.update) {
                    const parentPackage = inputData.contextData.systemPackages.find(
                        systemPackage => TrmPackage.compare(systemPackage, context.runtime.update)
                    );
                    if (parentPackage) {
                        parentPackage.manifest = new Manifest(_.cloneDeep(context.runtime.package.data.manifest));
                    }
                }
                const result = await InstallDependencyWkf(inputData, input => installWithRollback(input, context.runtime.lockedNamespaces || []));
                if (result.alreadyInstalled) {
                    continue;
                }
                if (!result.rollback) {
                    throw new Error(`Dependency install did not return its rollback journal.`);
                }
                context.runtime.dependencyRollbacks.push(result.rollback);
                if (result.release) {
                    context.runtime.dependencyReleases.push(result.release);
                }
                const installedPackage = new TrmPackage(
                    result.installOutput.manifest.name,
                    dependencyRegistry,
                    new Manifest(result.installOutput.manifest)
                );
                //the dependency install only updated its own copy of the snapshot
                for (const installed of [...(result.installedPackages || []), installedPackage]) {
                    const installedIndex = context.rawInput.contextData.systemPackages.findIndex(
                        systemPackage => TrmPackage.compare(systemPackage, installed)
                    );
                    if (installedIndex === -1) {
                        context.rawInput.contextData.systemPackages.push(installed);
                    } else {
                        context.rawInput.contextData.systemPackages.splice(installedIndex, 1, installed);
                    }
                    context.runtime.installedDependencies.push(installed);
                }
            } finally {
                Logger.setPrefix(originalLPrefix);
                Inquirer.setPrefix(originalIPrefix);
            }
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        let firstError: unknown;
        for (const rollback of [...context.runtime.dependencyRollbacks].reverse()) {
            try {
                await rollback();
            } catch (error) {
                firstError ||= error;
            }
        }
        if (firstError) {
            throw firstError;
        }
        //the rolled back packages are no longer installed
        const before = context.runtime.systemPackagesBeforeDependencies;
        if (before) {
            context.rawInput.contextData.systemPackages.splice(0, context.rawInput.contextData.systemPackages.length, ...before);
        }
        context.runtime.installedDependencies = [];
    }
}
