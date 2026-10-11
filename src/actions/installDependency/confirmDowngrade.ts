import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { lt } from "semver";

/**
 * Workflow step that requires explicit confirmation before a dependency install replaces a newer
 * installed release. `installData.checks.allowDowngrade` confirms it in advance; otherwise the
 * user is prompted, and without a prompt the install is aborted.
 *
 * 1- confirm downgrade
 *
*/
export const confirmDowngrade: Step<InstallDependencyWorkflowContext> = {
    name: 'confirm-downgrade',
    filter: async (context: InstallDependencyWorkflowContext): Promise<boolean> => {
        return !context.runtime.alreadyInstalled
            && !!context.runtime.installedVersion
            && lt(context.runtime.installVersion, context.runtime.installedVersion);
    },
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        //1- confirm downgrade
        const dependencyName = context.rawInput.dependencyDataPackage.name;
        const versionRange = context.rawInput.dependencyDataPackage.versionRange;
        const installedVersion = context.runtime.installedVersion;
        const installVersion = context.runtime.installVersion;
        Logger.warning(`Dependency "${dependencyName}" v${installedVersion} is installed, but ${versionRange} requires a downgrade to v${installVersion}.`, { important: true });
        if (context.rawInput.installData.checks.allowDowngrade) {
            return;
        }
        let confirmDowngrade = false;
        if (!context.rawInput.contextData.noInquirer) {
            confirmDowngrade = (await Inquirer.prompt({
                type: 'confirm',
                default: false,
                message: `Downgrade "${dependencyName}" from v${installedVersion} to v${installVersion}?`,
                name: 'confirmDowngrade'
            })).confirmDowngrade;
        }
        if (!confirmDowngrade) {
            throw new Error(`Install aborted. Dependency "${dependencyName}" v${installedVersion} would be downgraded to v${installVersion}. If you wish to downgrade, rerun install with downgrade allowed.`);
        }
    }
}
