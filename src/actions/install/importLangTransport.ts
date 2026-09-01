import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";
import { restoreTransport } from "./restoreTransport";

/**
 * Workflow step that imports the optional language transport and records rollback data.
 * 
 * 1- generate dummy transport (if registry is not local)
 * 
 * 2- upload transport binaries
 * 
 * 3- import transport
 * 
*/
export const importLangTransport: Step<InstallWorkflowContext> = {
    name: 'import-lang-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.import.noLang) {
            Logger.log(`Skipping import LANG transport (user input)`, true);
            return false;
        } else {
            if (context.runtime.transports.lang) {
                return true;
            } else {
                Logger.log(`Skipping import LANG transport (no transports in package)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        //1- generate dummy transport (if registry is not local)
        //checking if binaries are already loaded in context instead of checking registry local
        //is equivalent, but better for possible changes in the future
        //binaries for local registry are loaded in the checkTransports step
        if (!context.runtime.transports.lang.binaries.binaries) {
            Logger.loading(`Generating translations transport...`);
            const dummy = await Transport.createToc({
                text: context.runtime.package.data.transports.find(o => o.trkorr === context.runtime.transports.lang.binaries.trkorr)?.description || `LANG ${context.rawInput.packageData.name}`,
                target: SystemConnector.getDest(),
                trmIdentifier: TrmTransportIdentifier.LANG
            });
            await dummy.release(false, true);
            try {
                //saving dummy binaries for a possible revert
                context.revert.transports.lang = {
                    trkorr: dummy.trkorr,
                    entries: undefined,
                    binaries: (await dummy.download()).binaries
                };
            } catch (e) {
                Logger.error(`Unable to dowload dummy transport!`, true);
                Logger.error(e.toString(), true);
                Logger.error(`On failure, revert won't be possible!`, true);
            }
            context.runtime.transports.lang.binaries.binaries = await context.rawInput.packageData.registry.transport(context.runtime.transports.lang.binaries.trkorr, dummy.trkorr);
        }

        //2- upload transport binaries
        Logger.loading(`Uploading translations transport...`);
        context.runtime.transports.lang.instance = await Transport.upload(
            context.runtime.transports.lang.binaries.trkorr, {
            binary: context.runtime.transports.lang.binaries.binaries,
            trTarget: SystemConnector.getDest()
        });

        //3- import transport
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  Workbench) `;
        try {
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
            Logger.loading(`Importing ${context.runtime.transports.lang.binaries.trkorr}`, true);
            await context.runtime.transports.lang.instance.import();
            Logger.success(`Transport ${context.runtime.transports.lang.binaries.trkorr} imported`, true);
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.revert.transports.lang) {
            await restoreTransport(context.revert.transports.lang);
        }
    }
}
