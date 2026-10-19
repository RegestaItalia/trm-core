import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { trmTransportDescription } from "../../transport/TransportDescription";
import { Manifest } from "../../manifest";
import { SystemConnector } from "../../systemConnector";
import { cleanupDeletions } from "./prepareDeletion";
import { lacksTrmBackendApis } from "../commons/utils";

/**
 * Workflow step that creates the landscape transport used to carry installed changes onward.
 * 
 * 1- generate landscape transport
 * 
 * 2- add sap packages
 * 
 * 3- add workbench objects
 * 
 * 4- add namespace (if generated)
 * 
 * 5- add translations (if imported)
 * 
 * 6- add customizing (if imported)
 * 
 * 7- lock objects (the imported ones only)
 * 
 * 8- add the deletions of the upgrade
 * 
 * 9- add comments and documentation
 * 
*/
export const generateLandscapeTransport: Step<InstallWorkflowContext> = {
    name: 'generate-landscape-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.namespace === '$') {
            Logger.log(`Skipping install transport generation (package is temporary)`, true);
            return false;
        } else if (!context.rawInput.installData.landscapeTransport.targetSystem) {
            Logger.log(`Skipping install transport generation (system has no transport targets)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- generate landscape transport
        Logger.loading(`Generating landscape transport...`);
        context.output.transport = await Transport.createWb({
            text: trmTransportDescription(context.runtime.package.data.manifest.name, context.runtime.package.data.manifest.version),
            target: context.rawInput.installData.landscapeTransport.targetSystem
        });

        //2- add sap packages
        Logger.loading(`Locking transport...`);
        if (context.rawInput.installData.installDevclass.keepOriginal) {
            Logger.loading(`Including objects from DEVC transport...`, true);
            await context.output.transport.addObjectsFromTransport(context.runtime.transports.devc.instance.trkorr);
        } else {
            Logger.loading(`Adding package replacements...`, true);
            await context.output.transport.addObjects(context.rawInput.installData.installDevclass.replacements.map(o => {
                return {
                    pgmid: 'R3TR',
                    object: 'DEVC',
                    objName: o.installDevclass
                }
            }), true);
        }

        //3- add workbench objects
        Logger.loading(`Including objects from TADIR transport...`, true);
        await context.output.transport.addObjectsFromTransport(context.runtime.transports.tadir.instance.trkorr);

        //4- add namespace (if generated)
        //revert namespace is used as the soruce of an actual namespace that was generated
        //using context.runtime.namespace would be wrong because it's the package namespace, but it doesn't necessarily mean it was generated
        //check addNamespace step for clarification
        if (context.revert.namespace) {
            Logger.loading(`Checking namespace ${context.revert.namespace} lock...`, true);
            const nspcLock = await SystemConnector.getObjectsLocks([{
                PGMID: 'R3TR',
                OBJECT: 'NSPC',
                OBJ_NAME: context.revert.namespace
            }]);
            if (nspcLock.length === 0) {
                Logger.loading(`Adding namespace ${context.revert.namespace}...`, true);
                await context.output.transport.addObjects([{
                    pgmid: 'R3TR',
                    object: 'NSPC',
                    objName: context.revert.namespace
                }], true);
            } else {
                const lockTransports = [...new Set(nspcLock.map(o => o.trkorr))].join(', ');
                Logger.warning(`Namespace ${context.revert.namespace} is locked in transport ${lockTransports} and won't be included in the landscape transport.`, { important: true });
            }
        }

        //5- add translations (if imported)
        if (context.runtime.transports.lang) {
            Logger.loading(`Including objects from LANG transport...`, true);
            await context.output.transport.addObjectsFromTransport(context.runtime.transports.lang.instance.trkorr);
        }

        //6- add customizing (if imported)
        Logger.loading(`Including objects from ${context.runtime.transports.cust.length} CUST transports...`, true);
        for (const cust of context.runtime.transports.cust) {
            await context.output.transport.addObjectsFromTransport(cust.instance.trkorr);
        }

        //7- lock objects
        //what is lockable gets locked here: all the imported objects, before the deletions are added,
        //so objects that no longer exist are never locked
        //a backend without trmServer7 has no API for it
        if (!lacksTrmBackendApis(context, 'trmServer7')) {
            await context.output.transport.lock();
        }

        //8- add the deletions of the upgrade
        //the objects and keys are no longer on this system: their release exports them as deletions,
        //so the following systems get the same cleanup with this single transport
        for (const deletion of cleanupDeletions(context)) {
            Logger.loading(`Including deletions from transport ${deletion.trkorr}...`, true);
            await context.output.transport.addObjectsFromTransport(deletion.trkorr);
        }

        //9- add comments and documentation
        await context.output.transport.removeComments(); //start clean without TRM comments
        await context.output.transport.addComment(`name=${context.runtime.package.data.manifest.name}`);
        await context.output.transport.addComment(`version=${context.runtime.package.data.manifest.version}`);
        await context.output.transport.setDocumentation(new Manifest(context.runtime.package.data.manifest).getAbapXml());
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.output.transport && await context.output.transport.canBeDeleted()) {
            await context.output.transport.delete();
            context.output.transport = undefined;
        }
    }
}
