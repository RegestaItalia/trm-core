import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import _ from 'lodash';
import { stopWarning } from "../stopWarning";
import { TADIR } from "../../client";

/**
 * Import TADIR Transport.
 * 
 * 1- generate dummy transport (if registry is not local)
 * 
 * 2- upload transport binaries
 * 
 * 3- import transport
 * 
 * 4- reconnect when system is not stateless
 * 
 * 5- run tadir interface (package replacement)
 * 
*/
export const importTadirTransport: Step<InstallWorkflowContext> = {
    name: 'import-tadir-transport',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        //1- generate dummy transport (if registry is not local)
        //checking if binaries are already loaded in context instead of checking registry local
        //is equivalent, but better for possible changes in the future
        //binaries for local registry are loaded in the checkTransports step
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
        }

        //2- upload transport binaries
        Logger.loading(`Uploading workbench transport...`);
        context.runtime.transports.tadir.instance = await Transport.upload(
            context.runtime.transports.tadir.binaries.trkorr, {
            binary: context.runtime.transports.tadir.binaries.binaries,
            trTarget: SystemConnector.getDest()
        });

        //3- import transport
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  Workbench) `;
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
        Logger.loading(`Importing ${context.runtime.transports.tadir.binaries.trkorr}`, true);
        await context.runtime.transports.tadir.instance.import();
        Logger.success(`Transport ${context.runtime.transports.tadir.binaries.trkorr} imported`, true);
        Logger.setPrefix(originalLPrefix);
        Inquirer.setPrefix(originalIPrefix);

        Logger.loading(`Finalizing workbench import...`);

        //4- reconnect when system is not stateless
        if (!SystemConnector.isStateless()) {
            Logger.loading(`Closing connection for reconnect...`, true);
            await SystemConnector.closeConnection();
            Logger.loading(`Reopening connection...`, true);
            await SystemConnector.connect(true);
            Logger.success(`OK, continue`, true);
        }

        //5- run tadir interface (package replacement)
        //guard -> read from transports tadir entries: if for some reason there are more entries in other transports (it's a mistake?)
        //this would throw error, because the entry is not in system yet
        for (const tadir of context.runtime.transports.tadir.binaries.entries.tadir || []) {
            var object: TADIR = {
                pgmid: tadir.pgmid,
                object: tadir.object,
                objName: tadir.objName,
                devclass: tadir.devclass,
                srcsystem: 'TRM'
            };
            if (!context.rawInput.installData.installDevclass.keepOriginal) {
                const replacementDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === tadir.devclass);
                if (replacementDevclass && replacementDevclass.installDevclass) {
                    object.devclass = replacementDevclass.installDevclass;
                } else {
                    throw new Error(`Replacement ABAP package not found for ${tadir.devclass}!`);
                }
            }
            Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${tadir.devclass} -> ${object.devclass}, src system ${tadir.srcsystem} -> ${object.srcsystem}`, true);
            await SystemConnector.tadirInterface(object);
        }
    }
}