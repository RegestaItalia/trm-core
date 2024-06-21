import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Manifest } from "../../manifest";

export const checkAlreadyInstalled: Step<InstallDependencyWorkflowContext> = {
    name: 'check-already-installed',
    filter: async (context: InstallDependencyWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.forceInstall) {
            Logger.log(`Skipping already installed check (input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const aPackages = context.runtime.releasePackages;
        const installedPackages = context.parsedInput.systemPackages;
        var alreadyInstalled: boolean = false;
        aPackages.forEach(o => {
            if (!alreadyInstalled) {
                alreadyInstalled = installedPackages.find(ip => Manifest.compare(ip.manifest, o.manifest, true)) ? true : false;
            }
        });
        if (alreadyInstalled) {
            Logger.info(`Dependency "${packageName}" already installed.`);
            context.runtime.skipInstall = true;
        }
        context.runtime.skipInstall = alreadyInstalled;
    }
}