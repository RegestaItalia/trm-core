import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Logger } from "../../logger";
import { TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";


export const generateTadirTr: Step<PublishWorkflowContext> = {
    name: 'generate-tadir-tr',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.loading(`Generating TADIR transport...`);
        const sManifestXml = context.runtime.trmPackage.manifest.getAbapXml();
        const objectsOnly: TADIR[] = context.runtime.tadirObjects.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        context.runtime.tadirTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.TADIR,
            target: context.parsedInput.trTarget,
            text: `@X1@TRM: ${context.runtime.manifest.name} v${context.runtime.manifest.version}`
        });
        context.runtime.tryTadirDeleteRevert = true;
        await context.runtime.tadirTransport.addComment(`name=${context.runtime.manifest.name}`);
        await context.runtime.tadirTransport.addComment(`version=${context.runtime.manifest.version}`);
        await context.runtime.tadirTransport.setDocumentation(sManifestXml);
        await context.runtime.tadirTransport.addObjects(objectsOnly, false);
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        if (context.runtime.tryTadirDeleteRevert) {
            Logger.loading(`Rollback TADIR transport ${context.runtime.tadirTransport.trkorr}...`);
            try {
                const canBeDeleted = await context.runtime.tadirTransport.canBeDeleted();
                if (canBeDeleted) {
                    await context.runtime.tadirTransport.delete();
                } else {
                    await SystemConnector.addSkipTrkorr(context.runtime.tadirTransport.trkorr);
                }
                Logger.info(`Executed rollback on transport ${context.runtime.tadirTransport.trkorr}`);
            } catch (e) {
                Logger.info(`Unable to rollback transport ${context.runtime.tadirTransport.trkorr}`);
                Logger.error(e.toString(), true);
            }
        }
    }
}