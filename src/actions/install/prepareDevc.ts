import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";
import { restoreTransport } from "../commons/utils";

/**
 * Workflow step that prepares and test-imports ABAP package definitions.
 * 
 * 1- read if root already exists in system
 * 
 * 2- generate dummy transport (if registry is not local)
 * 
 * 3- upload transport binaries
 * 
 * 4- test import transport
 * 
*/
export const prepareDevc: Step<InstallWorkflowContext> = {
    name: 'prepare-devc',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installDevclass.keepOriginal) {
            return true;
        } else {
            Logger.log(`Skipping import DEVC transport (user input or devclass already generated)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- read if root already exists in system
        //this is needed later to understand if keeping the superpackage or not
        Logger.loading(`Getting ready to import SAP Packages...`);
        context.runtime.rootDevclassBeforeImport = await SystemConnector.getDevclass(context.runtime.package.hierarchy.devclass);

        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        //2- generate dummy transport (if registry is not local)
        //checking if binaries are already loaded in context instead of checking registry local
        //is equivalent, but better for possible changes in the future
        //binaries for local registry are loaded in the checkTransports step
        if (!context.runtime.transports.devc.binaries.binaries) {
            Logger.loading(`Generating SAP Packages transport...`);
            const dummy = await Transport.createToc({
                text: context.runtime.package.data.transports.find(o => o.trkorr === context.runtime.transports.devc.binaries.trkorr)?.description || `DEVC ${context.rawInput.packageData.name}`,
                target: SystemConnector.getDest(),
                trmIdentifier: TrmTransportIdentifier.DEVC
            });
            await dummy.release(false, true);
            try {
                //saving dummy binaries for a possible revert
                context.revert.transports.devc = {
                    trkorr: dummy.trkorr,
                    entries: undefined,
                    binaries: (await dummy.download()).binaries
                };
            } catch (e) {
                Logger.error(`Unable to dowload dummy transport!`, true);
                Logger.error(e.toString(), true);
                Logger.error(`On failure, revert won't be possible!`, true);
            }
            context.runtime.transports.devc.binaries.binaries = await context.rawInput.packageData.registry.transport(context.runtime.transports.devc.binaries.trkorr, dummy.trkorr);
        }

        //3- upload transport binaries
        Logger.loading(`Uploading SAP Packages transport...`);
        context.runtime.transports.devc.instance = await Transport.upload(
            context.runtime.transports.devc.binaries.trkorr, {
            binary: context.runtime.transports.devc.binaries.binaries,
            trTarget: SystemConnector.getDest()
        });

        //4- test import transport
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  SAP Packages) `;
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
            Logger.loading(`Testing import of ${context.runtime.transports.devc.binaries.trkorr}...`);
            const testRc = await context.runtime.transports.devc.instance.import(true);
            if (testRc < 0 || testRc > 8) {
                throw new Error(`Test import of transport ${context.runtime.transports.devc.binaries.trkorr} failed: check logs.`);
            }
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }

    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.revert.transports.devc) {
            await restoreTransport(context.revert.transports.devc);
        }
    }
}
