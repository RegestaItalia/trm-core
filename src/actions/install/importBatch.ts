import { Step } from "@simonegaffurini/sammarksworkflow";
import { Inquirer, Logger } from "trm-commons";
import { TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { InstallWorkflowContext } from ".";

/**
 * Workflow step that imports every prepared transport in one TMS batch.
 *
 * 1- collect prepared transport instances
 *
 * 2- import transports in batch
 *
 * 3- reconnect when system is not stateless
 *
 * 4- finalize SAP Packages import
 *
 * 5- finalize workbench import
 *
 */
export const importBatch: Step<InstallWorkflowContext> = {
    name: 'import-batch',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- collect prepared transport instances
        const transports = [
            context.runtime.transports.tadir.instance,
            context.runtime.transports.devc.instance,
            context.runtime.transports.lang?.instance,
            ...(context.runtime.transports.cust || []).map(cust => cust.instance)
        ].filter((transport): transport is Transport => Boolean(transport));

        //2- import transports in batch
        Logger.loading(`Installing...`);
        await Transport.importMultiple(transports, SystemConnector.getDest(), false);

        //3- reconnect when system is not stateless
        if (!SystemConnector.isStateless()) {
            Logger.loading(`Closing connection for reconnect...`, true);
            await SystemConnector.closeConnection();
            Logger.loading(`Reopening connection...`, true);
            await SystemConnector.connect(true);
            Logger.success(`OK, continue`, true);
        }

        //4- finalize SAP Packages import
        if (context.runtime.transports.devc.instance) {
            Logger.loading(`Finalizing SAP Packages import...`);
            for (const tdevc of context.runtime.transports.devc.binaries.entries.tdevc || []) {
                Logger.log(`Running TDEVC interface for devclass ${tdevc.devclass} -> transport layer ${context.rawInput.installData.installDevclass.transportLayer}`, true);
                await SystemConnector.setPackageTransportLayer(tdevc.devclass, context.rawInput.installData.installDevclass.transportLayer);
            }

            const rootDevclass = context.runtime.rootDevclassBeforeImport;
            if (rootDevclass?.parentcl) {
                await SystemConnector.setPackageSuperpackage(context.runtime.package.hierarchy.devclass, rootDevclass.parentcl);
            } else {
                await SystemConnector.clearPackageSuperpackage(context.runtime.package.hierarchy.devclass);
            }

            for (const tadir of (context.runtime.transports.devc.binaries.entries.tadir || []).filter(entry => entry.srcsystem !== 'TRM')) {
                const object: TADIR = {
                    pgmid: tadir.pgmid,
                    object: tadir.object,
                    objName: tadir.objName,
                    devclass: tadir.devclass,
                    srcsystem: 'TRM'
                };
                Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${object.devclass} -> src system ${object.srcsystem}`, true);
                await SystemConnector.tadirInterface(object);
            }
        }

        //5- finalize workbench import
        Logger.loading(`Finalizing workbench import...`);
        for (const tadir of context.runtime.transports.tadir.binaries.entries.tadir || []) {
            const object: TADIR = {
                pgmid: tadir.pgmid,
                object: tadir.object,
                objName: tadir.objName,
                devclass: tadir.devclass,
                srcsystem: 'TRM'
            };
            if (!context.rawInput.installData.installDevclass.keepOriginal) {
                const replacementDevclass = context.rawInput.installData.installDevclass.replacements.find(entry => entry.originalDevclass === tadir.devclass);
                if (!replacementDevclass?.installDevclass) {
                    throw new Error(`Replacement ABAP package not found for ${tadir.devclass}!`);
                }
                object.devclass = replacementDevclass.installDevclass;
            }
            Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${tadir.devclass} -> ${object.devclass}, src system ${tadir.srcsystem} -> ${object.srcsystem}`, true);
            await SystemConnector.tadirInterface(object);
        }
    }
};
