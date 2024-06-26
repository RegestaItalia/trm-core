import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Manifest } from "../../manifest";
import { eq, gt } from "semver";

export const checkAlreadyInstalled: Step<InstallWorkflowContext> = {
    name: 'check-already-installed',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.parsedInput.skipAlreadyInstalledCheck){
            Logger.log(`Skipping already installed check (input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const installedPackages = context.parsedInput.systemPackages;
        const oManifest = context.runtime.manifest;
        const trmManifest = context.runtime.trmManifest;
        const installedPackage = installedPackages.find(o => Manifest.compare(o.manifest, oManifest, false));
        if(installedPackage){
            const installVersion = trmManifest.version;
            const installedVersion = installedPackage.manifest.get().version;
            if(eq(installVersion, installedVersion)){
                if(context.parsedInput.forceInstallSameVersion){
                    Logger.log(`Package ${trmManifest.name} version ${installedVersion} already installed, but install is forced (input)`, true);
                }else{
                    throw new Error(`Package ${trmManifest.name} version ${installedVersion} already installed.`);
                }
            }else{
                if(context.parsedInput.overwriteInstall){
                    Logger.log(`Package ${trmManifest.name} version ${installedVersion} already installed, but install is forced (input)`, true);
                    if(gt(installVersion, installedVersion)){
                        Logger.info(`Upgrading ${installedVersion} -> ${installVersion}`);
                    }else{
                        Logger.warning(`Downgrading ${installedVersion} -> ${installVersion}`);
                    }
                }else{
                    throw new Error(`Package ${trmManifest.name} version ${installedVersion} already installed.`);
                }
            }
            
        }
    }
}