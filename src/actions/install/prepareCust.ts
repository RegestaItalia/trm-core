import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";
import { restoreTransport } from "../commons/utils";
import { TRKORR } from "../../client";

/**
 * Workflow step that prepares and test-imports each customizing transport.
 * 
 * 1- generate dummy transport (if registry is not local)
 * 
 * 2- upload transport binaries
 * 
 * 3- test import transport
 * 
*/
export const prepareCust: Step<InstallWorkflowContext> = {
    name: 'prepare-cust',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.import.noCust) {
            Logger.log(`Skipping import CUST transport (user input)`, true);
            return false;
        } else {
            if (context.runtime.transports.cust.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping import CUST transport (no transports in package)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }
        const originalLPrefix1 = Logger.getPrefix();
        const originalIPrefix1 = Inquirer.getPrefix();
        try {
            var index = 0;
            for (var cust of context.runtime.transports.cust) {
                index++;

                const prefix1 = `(${index}/${context.runtime.transports.cust.length}) `;
                if (originalLPrefix1) {
                    Logger.setPrefix(`${originalLPrefix1}-> ${prefix1}`);
                } else {
                    Logger.setPrefix(prefix1);
                }
                if (originalIPrefix1) {
                    Inquirer.setPrefix(`${originalIPrefix1}-> ${prefix1}`);
                } else {
                    Inquirer.setPrefix(prefix1);
                }

                //1- generate dummy transport (if registry is not local)
                //checking if binaries are already loaded in context instead of checking registry local
                //is equivalent, but better for possible changes in the future
                //binaries for local registry are loaded in the checkTransports step
                var trkorr: TRKORR;
                if (!cust.binaries.binaries) {
                    Logger.loading(`Generating customizing transport...`);
                    const dummy = await Transport.createToc({
                        text: context.runtime.package.data.transports.find(o => o.trkorr === cust.binaries.trkorr)?.description || `CUST ${index} ${context.rawInput.packageData.name}`,
                        target: SystemConnector.getDest(),
                        trmIdentifier: TrmTransportIdentifier.CUST
                    });
                    await dummy.release(false, true);
                    try {
                        //saving dummy binaries for a possible revert
                        context.revert.transports.cust.push({
                            trkorr: dummy.trkorr,
                            entries: undefined,
                            binaries: (await dummy.download()).binaries
                        });
                    } catch (e) {
                        Logger.error(`Unable to dowload dummy transport!`, true);
                        Logger.error(e.toString(), true);
                        Logger.error(`On failure, revert won't be possible!`, true);
                    }
                    cust.binaries.binaries = await context.rawInput.packageData.registry.transport(cust.binaries.trkorr, dummy.trkorr);
                    trkorr = dummy.trkorr;
                } else {
                    trkorr = cust.binaries.trkorr;
                }

                //2- upload transport binaries
                Logger.loading(`Uploading customizing transport...`);
                cust.instance = await Transport.upload(
                    trkorr, {
                    binary: cust.binaries.binaries,
                    trTarget: SystemConnector.getDest()
                });

                //3- test import transport
                const originalLPrefix2 = Logger.getPrefix();
                const originalIPrefix2 = Inquirer.getPrefix();
                const prefix2 = `(${Transport.getTransportIcon()}  Customizing) `;
                try {
                    if (originalLPrefix2) {
                        Logger.setPrefix(`${originalLPrefix2}-> ${prefix2}`);
                    } else {
                        Logger.setPrefix(prefix2);
                    }
                    if (originalIPrefix2) {
                        Inquirer.setPrefix(`${originalIPrefix2}-> ${prefix2}`);
                    } else {
                        Inquirer.setPrefix(prefix2);
                    }
                    Logger.loading(`Testing import...`);
                    const testRc = await cust.instance.import(true);
                    if (testRc < 0 || testRc > 8) {
                        throw new Error(`Test import of customizing failed: check logs.`);
                    }
                } finally {
                    Logger.setPrefix(originalLPrefix2);
                    Inquirer.setPrefix(originalIPrefix2);
                }

                //replace context instance with current instance
                context.runtime.transports.cust[index - 1] = cust;
            }
        } finally {
            Logger.setPrefix(originalLPrefix1);
            Inquirer.setPrefix(originalIPrefix1);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        for (const cust of [...context.revert.transports.cust].reverse()) {
            await restoreTransport(cust);
        }
    }
}
