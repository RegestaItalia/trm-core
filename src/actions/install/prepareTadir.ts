import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { TransportImportError } from "../../transport/TransportImportError";
import { stopWarning } from "../stopWarning";
import { revertPreparedTransport, TRM_FIXED_TADIR_TRANSPORTS, withScopedPrefix } from "../commons/utils";
import { TRKORR } from "../../client";
import { deleteImportedEntries } from "./importBatch";

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

        await withScopedPrefix(`(${Transport.getTransportIcon()}  Workbench) `, async () => {
            //1- generate dummy transport (if registry is not local)
            //checking if binaries are already loaded in context instead of checking registry local
            //is equivalent, but better for possible changes in the future
            //binaries for local registry are loaded in the checkTransports step
            let trkorr: TRKORR;
            if (!context.runtime.transports.tadir.binaries.binaries) {
                Logger.loading(`Generating transport...`);
                const dummy = await Transport.createToc({
                    text: context.runtime.package.data.transports.find(o => o.trkorr === context.runtime.transports.tadir.binaries.trkorr)?.description || `TADIR ${context.rawInput.packageData.name}`,
                    target: SystemConnector.getDest(),
                    trmIdentifier: TrmTransportIdentifier.TADIR
                });
                context.revert.createdTransports.tadir = dummy;
                await dummy.release(false, true);
                context.runtime.transports.tadir.binaries.binaries = await context.rawInput.packageData.registry.transport(context.runtime.transports.tadir.binaries.trkorr, dummy.trkorr);
                trkorr = dummy.trkorr;
            } else {
                trkorr = context.runtime.transports.tadir.binaries.trkorr;
            }

            // trm-server and trm-rest reuse the same TADIR transport in every release. Remove the
            // previous queue entry before forwarding the new payload, otherwise TMS keeps its old
            // position. This is best effort: an absent entry (or an older backend that cannot remove
            // it) must not prevent the backend upgrade.
            const packageName = context.runtime.package.data.manifest?.name || context.rawInput.packageData.name;
            const fixedTrkorr = TRM_FIXED_TADIR_TRANSPORTS[packageName];
            if (context.runtime.selfUpdate && fixedTrkorr === trkorr) {
                try {
                    Logger.loading(`Removing previous ${trkorr} from ${SystemConnector.getDest()} import queue...`, true);
                    await SystemConnector.deleteTmsTransport(trkorr, SystemConnector.getDest());
                } catch (error) {
                    Logger.warning(`Couldn't remove ${trkorr} from ${SystemConnector.getDest()} import queue: ${error instanceof Error ? error.message : String(error)}`, true);
                }
            }

            //2- upload transport binaries
            Logger.loading(`Uploading transport...`);
            context.runtime.transports.tadir.instance = await Transport.upload(
                trkorr, {
                binary: context.runtime.transports.tadir.binaries.binaries,
                trTarget: SystemConnector.getDest()
            });

            //3- test import transport
            if (context.legacyBackend) {
                Logger.log(`Skipping test import: legacy TRM backend`, true);
            } else {
                Logger.loading(`Testing import...`);
                const testRc = await context.runtime.transports.tadir.instance.import(true);
                TransportImportError.assert(context.runtime.transports.tadir.instance.trkorr, testRc, `Test import of workbench`, context.runtime.transports.tadir.instance.lastImportMessage, context.ignoreImportErrors);
            }
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.revert.cleanupImported && (context.revert.namespace || context.revert.sapPackages.length > 0)) {
            await deleteImportedEntries(context);
        }
        // The dummy is deleted, or only taken out of the queue: never re-imported
        await revertPreparedTransport(context.revert.createdTransports.tadir);
    }
}
