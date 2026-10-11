import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";

/**
 * Workflow step that creates the transport containing ABAP package definitions.
 * 
 * 1- generate transport
 * 
*/
export const generateDevcTransport: Step<PublishWorkflowContext> = {
    name: 'generate-devc-transport',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('publish');
        }
        //1- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating DEVC transport...`, true);
        const aDevc = context.runtime.sapPackage.objects.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC');
        context.runtime.transports.devc = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.DEVC,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM (D) ${context.rawInput.packageData.name} v${context.rawInput.packageData.version}`.slice(0, 60)
        });
        await context.runtime.transports.devc.addObjects(aDevc, false);
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        if (context.runtime.transports.devc) {
            if (await context.runtime.transports.devc.canBeDeleted()) {
                await context.runtime.transports.devc.delete();
            }
        }
    }
}
