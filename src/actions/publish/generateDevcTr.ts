import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Logger } from "../../logger";
import { TADIR } from "../../client";


export const generateDevcTr: Step<WorkflowContext> = {
    name: 'generate-devc-tr',
    run: async (context: WorkflowContext): Promise<void> => {
        Logger.loading(`Generating DEVC transport...`);
        const devcOnly: TADIR[] = context.runtime.tadirObjects.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC');
        context.runtime.devcTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.DEVC,
            target: context.parsedInput.trTarget,
            text: `@X1@TRM: ${context.runtime.manifest.name} v${context.runtime.manifest.version} (D)`
        });
        await context.runtime.devcTransport.addObjects(devcOnly, false);
    },
    revert: async (context: WorkflowContext): Promise<void> => {
        if(!context.runtime.skipDevcTransportDelete){
            Logger.loading(`Rollback DEVC transport ${context.runtime.devcTransport.trkorr}...`);
            try{
                const canBeDeleted = await context.runtime.devcTransport.canBeDeleted();
                if(canBeDeleted){
                    await context.runtime.devcTransport.delete();
                    Logger.info(`Executed rollback on transport ${context.runtime.devcTransport.trkorr}`);
                }else{
                    throw new Error(`Transport ${context.runtime.devcTransport.trkorr} cannot be deleted`);
                }
            }catch(e){
                Logger.info(`Unable to rollback transport ${context.runtime.devcTransport.trkorr}`);
                Logger.error(e.toString(), true);
            }
        }
    }
}