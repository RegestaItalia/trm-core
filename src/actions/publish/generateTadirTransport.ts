import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Manifest } from "../../manifest";
import { SystemConnector } from "../../systemConnector";

/**
 * Generate TADIR transport
 * 
 * 1- remove gitignore objects
 * 
 * 2- check tadir has content
 * 
 * 2- generate transport
 * 
*/
export const generateTadirTransport: Step<PublishWorkflowContext> = {
    name: 'generate-tadir-transport',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Generate TADIR transport step', true);

        //1- remove gitignore objects
        var aTadir = context.runtime.packageData.tadir.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        var ignoredObjects = 0;
        context.runtime.abapGitData.sourceCode.ignoredObjects.forEach(o => {
            const objectIndex = aTadir.findIndex(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName);
            if(objectIndex >= 0){
                ignoredObjects++;
                aTadir.splice(objectIndex, 1);
            }
        });
        if(ignoredObjects > 0){
            Logger.info(`${ignoredObjects} object/s are ignored (as specified in .abapgit.xml)`);
        }

        //2- check tadir has content
        if(aTadir.length === 0){
            throw new Error(`Package ${context.rawInput.packageData.devclass} has no content.`);
        }
        
        //3- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating TADIR transport...`, true);
        const sManifestXml = new Manifest(context.runtime.trmPackage.manifest).getAbapXml();
        context.runtime.systemData.tadirTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.TADIR,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM: ${context.rawInput.packageData.name} v${context.rawInput.packageData.version}`
        });
        await context.runtime.systemData.tadirTransport.addComment(`name=${context.rawInput.packageData.name}`);
        await context.runtime.systemData.tadirTransport.addComment(`version=${context.rawInput.packageData.version}`);
        await context.runtime.systemData.tadirTransport.setDocumentation(sManifestXml);
        await context.runtime.systemData.tadirTransport.addObjects(aTadir, false);
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Rollback generate TADIR transport step', true);
        if (context.runtime.systemData.tadirTransport) {
            try {
                if (await context.runtime.systemData.tadirTransport.canBeDeleted()) {
                    await context.runtime.systemData.tadirTransport.delete();
                    Logger.success(`Executed rollback on transport ${context.runtime.systemData.tadirTransport.trkorr}`, true);
                } else {
                    await SystemConnector.addSkipTrkorr(context.runtime.systemData.tadirTransport.trkorr);
                }
            } catch (e) {
                Logger.error(`Unable to rollback transport ${context.runtime.systemData.tadirTransport.trkorr}!`);
                Logger.error(e.toString(), true);
            }
        }
    }
}