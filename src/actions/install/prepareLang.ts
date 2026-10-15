import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { TransportImportError } from "../../transport/TransportImportError";
import { stopWarning } from "../stopWarning";
import { revertPreparedTransport, withScopedPrefix } from "../commons/utils";
import { TRKORR } from "../../client";
import { deleteImportedEntries } from "./importBatch";

/**
 * Workflow step that prepares and test-imports the optional language transport.
 *
 * 1- generate dummy transport (if registry is not local)
 *
 * 2- upload transport binaries
 *
 * 3- test import transport
 *
*/
export const prepareLang: Step<InstallWorkflowContext> = {
    name: 'prepare-lang',
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

        await withScopedPrefix(`(${Transport.getTransportIcon()}  Translations) `, async () => {
            //1- generate dummy transport (if registry is not local)
            //checking if binaries are already loaded in context instead of checking registry local
            //is equivalent, but better for possible changes in the future
            //binaries for local registry are loaded in the checkTransports step
            let trkorr: TRKORR;
            if (!context.runtime.transports.lang.binaries.binaries) {
                Logger.loading(`Generating transport...`);
                const dummy = await Transport.createToc({
                    text: context.runtime.package.data.transports.find(o => o.trkorr === context.runtime.transports.lang.binaries.trkorr)?.description || `LANG ${context.rawInput.packageData.name}`,
                    target: SystemConnector.getDest(),
                    trmIdentifier: TrmTransportIdentifier.LANG
                });
                context.revert.createdTransports.lang = dummy;
                await dummy.release(false, true);
                context.runtime.transports.lang.binaries.binaries = await context.rawInput.packageData.registry.transport(context.runtime.transports.lang.binaries.trkorr, dummy.trkorr);
                trkorr = dummy.trkorr;
            } else {
                trkorr = context.runtime.transports.lang.binaries.trkorr;
            }

            //2- upload transport binaries
            Logger.loading(`Uploading transport...`);
            context.runtime.transports.lang.instance = await Transport.upload(
                trkorr, {
                binary: context.runtime.transports.lang.binaries.binaries,
                trTarget: SystemConnector.getDest()
            });

            //3- test import transport
            if (context.legacyBackend) {
                Logger.log(`Skipping test import: legacy TRM backend`, true);
            } else {
                Logger.loading(`Testing import...`);
                const testRc = await context.runtime.transports.lang.instance.import(true);
                TransportImportError.assert(context.runtime.transports.lang.instance.trkorr, testRc, `Test import of translations`, context.runtime.transports.lang.instance.lastImportMessage);
            }
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.revert.cleanupImported && (context.revert.namespace || context.revert.sapPackages.length > 0)) {
            await deleteImportedEntries(context);
        }
        // The dummy is deleted, or only taken out of the queue: never re-imported
        await revertPreparedTransport(context.revert.createdTransports.lang);
    }
}
