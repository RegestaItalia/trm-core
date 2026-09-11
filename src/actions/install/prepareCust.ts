import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";
import { revertPreparedTransport, withScopedPrefix } from "../commons/utils";
import { TRKORR } from "../../client";
import { deleteImportedEntries } from "./importBatch";

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
        let index = 0;
        for (const cust of context.runtime.transports.cust) {
            index++;
            const prefix = `(${Transport.getTransportIcon()}  ${index}/${context.runtime.transports.cust.length} Customizing) `;
            await withScopedPrefix(prefix, async () => {
                //1- generate dummy transport (if registry is not local)
                //checking if binaries are already loaded in context instead of checking registry local
                //is equivalent, but better for possible changes in the future
                //binaries for local registry are loaded in the checkTransports step
                let trkorr: TRKORR;
                if (!cust.binaries.binaries) {
                    Logger.loading(`Generating transport...`);
                    const dummy = await Transport.createToc({
                        text: context.runtime.package.data.transports.find(o => o.trkorr === cust.binaries.trkorr)?.description || `CUST ${index} ${context.rawInput.packageData.name}`,
                        target: SystemConnector.getDest(),
                        trmIdentifier: TrmTransportIdentifier.CUST
                    });
                    context.revert.createdTransports.cust.push(dummy);
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
                Logger.loading(`Uploading transport...`);
                cust.instance = await Transport.upload(
                    trkorr, {
                    binary: cust.binaries.binaries,
                    trTarget: SystemConnector.getDest()
                });

                //3- test import transport
                Logger.loading(`Testing import...`);
                const testRc = await cust.instance.import(true);
                if (testRc < 0 || testRc > 8) {
                    throw new Error(`Test import of customizing failed: check logs.`);
                }
            });
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.revert.cleanupImported && (context.revert.namespace || context.revert.sapPackages.length > 0)) {
            await deleteImportedEntries(context);
        }
        if (context.revert.cleanupImported && !context.revert.cleanupSucceeded) {
            return;
        }
        for (const cust of [...context.revert.transports.cust].reverse()) {
            const generated = context.revert.createdTransports.cust.find(transport => transport.trkorr === cust.trkorr);
            await revertPreparedTransport(generated, cust);
        }
        for (const generated of [...context.revert.createdTransports.cust].reverse()) {
            const hasSnapshot = context.revert.transports.cust.some(snapshot => snapshot.trkorr === generated.trkorr);
            if (!hasSnapshot) {
                await revertPreparedTransport(generated, undefined);
            }
        }
    }
}
