import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";

/**
 * Generate TADIR transport
 * 
 * 1- generate transport
 * 
*/
export const generateTadirTransport: Step<PublishWorkflowContext> = {
    name: 'generate-tadir-transport',
        run: async (context: PublishWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('publish');
        }
        //1- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating TADIR transport...`, true);
        const aTadir = context.runtime.sapPackage.objects.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        context.runtime.transports.tadir = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.TADIR,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM ${context.rawInput.packageData.name} v${context.rawInput.packageData.version}`.slice(0, 60)
        });
        await context.runtime.transports.tadir.addObjects(aTadir, false);
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        if (context.runtime.transports.tadir) {
            if (await context.runtime.transports.tadir.canBeDeleted()) {
                await context.runtime.transports.tadir.delete();
            }
        }
    }
}