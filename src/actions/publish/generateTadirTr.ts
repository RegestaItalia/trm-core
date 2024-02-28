import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Logger } from "../../logger";
import { TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";


export const generateTadirTr: Step<WorkflowContext> = {
    name: 'generate-tadir-tr',
    run: async (context: WorkflowContext): Promise<void> => {
        Logger.loading(`Generating TADIR transport...`);
        const sManifestXml = context.runtime.trmPackage.manifest.getAbapXml();
        const objectsOnly: TADIR[] = context.runtime.tadirObjects.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        context.runtime.tadirTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.TADIR,
            target: context.parsedInput.trTarget,
            text: `@X1@TRM: ${context.runtime.manifest.name} v${context.runtime.manifest.version}`
        });
        await context.runtime.tadirTransport.addComment(`name=${context.runtime.manifest.name}`);
        await context.runtime.tadirTransport.addComment(`version=${context.runtime.manifest.version}`);
        await context.runtime.tadirTransport.setDocumentation(sManifestXml);
        await context.runtime.tadirTransport.addObjects(objectsOnly, false);
        context.runtime.tryTadirDeleteRevert = true;
    },
    revert: async (context: WorkflowContext): Promise<void> => {
        if (context.runtime.tryTadirDeleteRevert) {
            Logger.loading(`Rollback TADIR transport ${context.runtime.tadirTransport.trkorr}...`);
            try {
                const canBeDeleted = await context.runtime.tadirTransport.canBeDeleted();
                if (canBeDeleted) {
                    await context.runtime.tadirTransport.delete();
                    Logger.info(`Executed rollback on transport ${context.runtime.tadirTransport.trkorr}`);
                } else {
                    await SystemConnector.addSkipTrkorr(context.runtime.tadirTransport.trkorr);
                }
            } catch (e) {
                Logger.info(`Unable to rollback transport ${context.runtime.tadirTransport.trkorr}`);
                Logger.error(e.toString(), true);
            }
        }
    }
}