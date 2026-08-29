import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { TADIR } from "../../client";
import { stopWarning } from "../stopWarning";

/**
 * Workflow step that imports ABAP package definitions and records rollback data.
 * 
 * 1- read if root already exists in system
 * 
 * 2- generate dummy transport (if registry is not local)
 * 
 * 3- upload transport binaries
 * 
 * 4- import transport
 * 
 * 5- reconnect when system is not stateless
 * 
 * 6- set transport layer
 * 
 * 7- replace root devclass parent devclass
 * 
 * 8- set TRM as source
 * 
*/
export const importDevcTransport: Step<InstallWorkflowContext> = {
    name: 'import-devc-transport',
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
        const rootDevclass = await SystemConnector.getDevclass(context.runtime.package.hierarchy.devclass);

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

        //4- import transport
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
            Logger.loading(`Importing ${context.runtime.transports.devc.binaries.trkorr}`, true);
            await context.runtime.transports.devc.instance.import();
            Logger.success(`Transport ${context.runtime.transports.devc.binaries.trkorr} imported`, true);
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }

        Logger.loading(`Finalizing SAP Packages import...`);

        //5- reconnect when system is not stateless
        if (!SystemConnector.isStateless()) {
            Logger.loading(`Closing connection for reconnect...`, true);
            await SystemConnector.closeConnection();
            Logger.loading(`Reopening connection...`, true);
            await SystemConnector.connect(true);
            Logger.success(`OK, continue`, true);
        }

        //6- set transport layer
        //guard -> read from transports tdevc entries: if for some reason there are more entries in other transports (it's a mistake?)
        //this would throw error, because the package is not in system yet
        for (const tdevc of context.runtime.transports.devc.binaries.entries.tdevc || []) {
            Logger.log(`Running TDEVC interface for devclass ${tdevc.devclass} -> transport layer ${context.rawInput.installData.installDevclass.transportLayer}`, true);
            await SystemConnector.setPackageTransportLayer(tdevc.devclass, context.rawInput.installData.installDevclass.transportLayer);
        }

        //7- replace root devclass parent devclass
        //this resets to user defined superpackage if package was already in system
        //or clears original superpackage if there was one at publish
        if (rootDevclass && rootDevclass.parentcl) {
            await SystemConnector.setPackageSuperpackage(context.runtime.package.hierarchy.devclass, rootDevclass.parentcl)
        } else {
            await SystemConnector.clearPackageSuperpackage(context.runtime.package.hierarchy.devclass);
        }

        //8- set TRM as source
        //guard -> read from transports tadir entries and filter where srcsystem is not already TRM (avoiding useless calls)
        for (const tadir of (context.runtime.transports.devc.binaries.entries.tadir || []).filter(o => o.srcsystem !== 'TRM')) {
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
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if(context.revert.transports.devc){
            //TODO: upload original binaries back to the transport and import
        }
    }
}
