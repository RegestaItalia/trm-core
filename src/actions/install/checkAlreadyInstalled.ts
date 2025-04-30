import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Manifest } from "../../manifest";
import { eq, gt } from "semver";

/**
 * Check if already installed
 * 
 * 1- get data
 * 
 * 2- check if already installed
 * 
*/
export const checkAlreadyInstalled: Step<InstallWorkflowContext> = {
    name: 'check-already-installed',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check already installed step', true);

        //1- get data
        const installedPackages = context.rawInput.contextData.systemPackages;
        const manifest = context.runtime.remotePackageData.manifest;
        const trmManifest = context.runtime.remotePackageData.trmManifest;

        //2- check if already installed
        const installedPackage = installedPackages.find(o => Manifest.compare(o.manifest, manifest, false));
        if(installedPackage){
            const installVersion = trmManifest.version;
            const installedVersion = installedPackage.manifest.get().version;
            context.runtime.update = true;
            if(eq(installVersion, installedVersion)){
                if(context.rawInput.packageData.overwrite){
                    Logger.info(`Package "${trmManifest.name}" version ${installedVersion} already installed.`);
                }else{
                    throw new Error(`Package "${trmManifest.name}" version ${installedVersion} already installed.`);
                }
            }else{
                if(gt(installVersion, installedVersion)){
                    Logger.info(`Upgrading ${installedVersion} -> ${installVersion}`);
                }else{
                    Logger.warning(`Downgrading ${installedVersion} -> ${installVersion}`);
                }
            }
        }else{
            context.runtime.update = false;
            Logger.info(`Package not installed yet`, true);
        }
    }
}