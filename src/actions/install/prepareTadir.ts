import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";
import { restoreTransport } from "../commons/utils";
import { TRKORR } from "../../client";

/**
 * Workflow step that prepares and test-imports repository objects.
 * 
 * 1- generate dummy transport (if registry is not local)
 * 
 * 2- upload transport binaries
 * 
 * 3- test import transport
 * 
*/
export const prepareTadir: Step<InstallWorkflowContext> = {
    name: 'prepare-tadir',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        //1- generate dummy transport (if registry is not local)
        //checking if binaries are already loaded in context instead of checking registry local
        //is equivalent, but better for possible changes in the future
        //binaries for local registry are loaded in the checkTransports step
        var trkorr: TRKORR;
        if (!context.runtime.transports.tadir.binaries.binaries) {
            Logger.loading(`Generating workbench transport...`);
            const dummy = await Transport.createToc({
                text: context.runtime.package.data.transports.find(o => o.trkorr === context.runtime.transports.tadir.binaries.trkorr)?.description || `TADIR ${context.rawInput.packageData.name}`,
                target: SystemConnector.getDest(),
                trmIdentifier: TrmTransportIdentifier.TADIR
            });
            await dummy.release(false, true);
            try {
                //saving dummy binaries for a possible revert
                context.revert.transports.tadir = {
                    trkorr: dummy.trkorr,
                    entries: undefined,
                    binaries: (await dummy.download()).binaries
                };
            } catch (e) {
                Logger.error(`Unable to dowload dummy transport!`, true);
                Logger.error(e.toString(), true);
                Logger.error(`On failure, revert won't be possible!`, true);
            }
            context.runtime.transports.tadir.binaries.binaries = await context.rawInput.packageData.registry.transport(context.runtime.transports.tadir.binaries.trkorr, dummy.trkorr);
            trkorr = dummy.trkorr;
        }else{
            trkorr = context.runtime.transports.tadir.binaries.trkorr;
        }

        //2- upload transport binaries
        Logger.loading(`Uploading workbench transport...`);
        context.runtime.transports.tadir.instance = await Transport.upload(
            trkorr, {
            binary: context.runtime.transports.tadir.binaries.binaries,
            trTarget: SystemConnector.getDest()
        });

        //3- test import transport
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
            Logger.loading(`Testing import of ${trkorr}...`);
            const testRc = await context.runtime.transports.tadir.instance.import(true);
            if (testRc < 0 || testRc > 8) {
                throw new Error(`Test import of transport ${trkorr} failed: check logs.`);
            }
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }

    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.revert.transports.tadir) {
            await restoreTransport(context.revert.transports.tadir);
        }
    }
}
