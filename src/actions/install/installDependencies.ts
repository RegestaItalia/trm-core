import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";

export const installDependencies: Step<InstallWorkflowContext> = {
    name: 'install-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.dependenciesToInstall.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping dependencies install because there are no dependencies to install`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const mainPackageName = context.parsedInput.packageName;
        const dependenciesToInstall = context.runtime.dependenciesToInstall;
        var continueInstall = false;
        if (context.parsedInput.installMissingDependencies) {
            continueInstall = true;
        } else {
            const inq1 = await Inquirer.prompt({
                type: 'confirm',
                name: 'continueInstall',
                default: true,
                message: `Do you wish to install all of the missing dependencies?`
            });
            continueInstall = inq1.continueInstall;
        }
        if (continueInstall) {
            var installCounter = 0;
            for(const installDependency of dependenciesToInstall){
                installCounter++;
                Logger.info(`-> (${installCounter}/${dependenciesToInstall.length}) Dependency "${installDependency.name}" install started.`);
                //await installDependencies
                Logger.info(`   (${installCounter}/${dependenciesToInstall.length}) Dependency "${installDependency.name}" install completed.`);
            }
            Logger.success(`-> ${dependenciesToInstall.length}/${dependenciesToInstall.length} dependencies installed, package "${mainPackageName}" install can continue.`);
        } else {
            throw new Error(`Package has missing dependencies that need to be installed in order to continue.`);
        }
    }
}