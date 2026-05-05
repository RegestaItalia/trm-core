import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { Manifest } from "../../manifest";
import { eq, gt } from "semver";
import { SystemConnector } from "../../systemConnector";
import chalk from "chalk";

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
        const trmManifest = context.runtime.remotePackageData.manifest;

        //2- check if already installed
        context.runtime.installData.upgradingPackage = installedPackages.find(o => Manifest.compare(o.manifest, new Manifest(manifest), false));
        if(context.runtime.installData.upgradingPackage){
            const installVersion = trmManifest.version;
            const installedVersion = context.runtime.installData.upgradingPackage.manifest.get().version;
            context.runtime.update = true;
            if(eq(installVersion, installedVersion)){
                if(context.rawInput.packageData.overwrite){
                    Logger.info(`Package "${trmManifest.name}" version ${installedVersion} already installed, overwriting.`);
                }else{
                    throw new Error(`Package "${trmManifest.name}" version ${installedVersion} already installed.`);
                }
            }else{
                if(gt(installVersion, installedVersion)){
                    Logger.info(`${chalk.bold('Upgrading')} ${installedVersion} -> ${installVersion}`);
                }else{
                    Logger.warning(`${chalk.bold('Downgrading')} ${installedVersion} -> ${installVersion}`);
                }
            }
            if(context.runtime.installData.upgradingPackage.isDirty()){
                var ignoreDirty = false;
                Logger.warning(`There are some changes on ${SystemConnector.getDest()} that may be overwritten!`);
                Logger.warning(`Consider analyzing dirty entries for package "${trmManifest.name}"`);
                if(!context.rawInput.contextData.noInquirer){
                    ignoreDirty = (await Inquirer.prompt({
                        message: `Continue with install?`,
                        type: 'confirm',
                        default: false,
                        name: 'ignoreDirty'
                    })).ignoreDirty;
                }
                if(!ignoreDirty){
                    throw new Error(`Install of package "${trmManifest.name}" aborted.`);
                }
            }
        }else{
            context.runtime.update = false;
            Logger.info(`Package not installed yet`, true);
        }
    }
}