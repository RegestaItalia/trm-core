import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { Manifest } from "../../manifest";

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
 * 7- add comments and documentation
 * 
*/
export const generateLandscapeTransport: Step<InstallWorkflowContext> = {
    name: 'generate-landscape-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.namespace !== '$') {
            return true;
        } else {
            Logger.log(`Skipping install transport generation (package is temporary)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- generate landscape transport
        Logger.loading(`Generating landscape transport...`);
        context.output.transport = await Transport.createWb({
            text: `@X1@TRM ${context.runtime.package.data.manifest.name} ${context.runtime.package.data.manifest.version}`,
            target: context.rawInput.installData.landscapeTransport.targetSystem
        });

        //2- add sap packages
        Logger.loading(`Locking landscape transport...`);
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
            Logger.loading(`Adding namespace ${context.revert.namespace}...`, true);
            await context.output.transport.addObjects([{
                pgmid: 'R3TR',
                object: 'NSPC',
                objName: context.revert.namespace
            }], false);
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

        //7- add comments and documentation
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
