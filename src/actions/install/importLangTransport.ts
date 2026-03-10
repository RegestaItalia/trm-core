import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { stopWarning } from "../stopWarning";

/**
 * Import LANG Transport.
 * 
 * 1- upload transport into system
 * 
 * 2 - delete from tms buffer (if it exists)
 * 
 * 3- import transport into system
 * 
*/
export const importLangTransport: Step<InstallWorkflowContext> = {
    name: 'import-lang-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.import.noLang) {
            Logger.log(`Skipping import LANG transport (user input)`, true);
            return false;
        } else {
            if (context.runtime.packageTransports.lang.binaries) {
                return true;
            } else {
                Logger.log(`Skipping import LANG transport (no transports in package)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Import LANG Transport step', true);

        Logger.loading(`Importing ${context.rawInput.packageData.name} translations...`);

        //1- upload transport into system
        Logger.loading(`Uploading ${context.runtime.packageTransports.lang.binaries.trkorr}`, true);
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }
        context.runtime.packageTransports.lang.instance = await Transport.upload({
            binary: context.runtime.packageTransports.lang.binaries.binaries,
            trTarget: SystemConnector.getDest(),
            r3transOption: context.rawInput.contextData.r3transOptions
        });

        //2 - delete from tms buffer (if it exists)
        await context.runtime.packageTransports.lang.instance.deleteFromTms(SystemConnector.getDest());

        //3- import transport into system
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()} Translations) `;
        if (originalLPrefix) {
            Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
        } else {
            Logger.setPrefix(prefix);
        }
        if (originalIPrefix) {
            Inquirer.setPrefix(`${originalIPrefix}-> ${prefix}`);
        } else {
            Inquirer.setPrefix(prefix);
        }
        Logger.loading(`Importing ${context.runtime.packageTransports.lang.binaries.trkorr}`, true);
        await context.runtime.packageTransports.lang.instance.import();
        Logger.success(`Transport ${context.runtime.packageTransports.lang.binaries.trkorr} imported`, true);
        Logger.setPrefix(originalLPrefix);
        Inquirer.setPrefix(originalIPrefix);

    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Rollback LANG Transport step', true);

        Logger.warning(`Language transport ${context.runtime.packageTransports.lang.binaries.trkorr} can't be reverted.`);
    }
}