import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";

/**
 * Generate DEVC transport
 * 
 * 1- generate transport
 * 
*/
export const generateDevcTransport: Step<PublishWorkflowContext> = {
    name: 'generate-devc-transport',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Generate DEVC transport step', true);

        //1- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating DEVC transport...`, true);
        const aDevc = context.runtime.packageData.tadir.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC');
        context.runtime.systemData.devcTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.DEVC,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM: ${context.rawInput.packageData.name} v${context.rawInput.packageData.version} (D)`
        });
        await context.runtime.systemData.devcTransport.addComment(`name=${context.rawInput.packageData.name}`);
        await context.runtime.systemData.devcTransport.addComment(`version=${context.rawInput.packageData.version}`);
        await context.runtime.systemData.devcTransport.addObjects(aDevc, false);
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Rollback generate DEVC transport step', true);
        if (context.runtime.systemData.devcTransport) {
            try {
                if (await context.runtime.systemData.devcTransport.canBeDeleted()) {
                    await context.runtime.systemData.devcTransport.delete();
                    Logger.success(`Executed rollback on transport ${context.runtime.systemData.devcTransport.trkorr}`, true);
                }
            } catch (e) {
                Logger.error(`Unable to rollback transport ${context.runtime.systemData.devcTransport.trkorr}!`);
                Logger.error(e.toString(), true);
            }
        }
    }
}