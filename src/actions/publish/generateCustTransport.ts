import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";

/**
 * Workflow step that packages each selected customizing request for publication.
 * 
 * 1- generate transport
 * 
*/
export const generateCustTransport: Step<PublishWorkflowContext> = {
    name: 'generate-cust-transport',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.rawInput.publishData.noCustomizingTransports) {
            Logger.log(`Skipping CUST transport generation (user input)`, true);
            return false;
        } else {
            if (context.runtime.customizing.new.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping CUST transport generation (no new customizing transports)`, true);
                return false;
            }
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        //1- generate transport
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('publish');
        }
        Logger.loading(`Generating transports...`);
        for (const cust of context.runtime.customizing.new) {
            Logger.loading(`Generating CUST transport (copy of ${cust.trkorr})...`, true);
            const custInstance = new Transport(cust.trkorr);
            var aggregate = [custInstance];
            aggregate = aggregate.concat(await (custInstance.getTasks()));
            const transport = await Transport.createToc({
                trmIdentifier: TrmTransportIdentifier.CUST,
                target: context.rawInput.systemData.transportTarget,
                text: cust.description.trim().slice(0, 60),
            });
            // Track the TOC before populating it so workflow rollback can delete it if a
            // subsequent copy or content check fails.
            context.runtime.transports.cust.push(transport);
            for (const aggInstance of aggregate) {
                await transport.addObjectsFromTransport(aggInstance.trkorr);
            }
            //check transport has content (else delete)
            const e071 = await transport.getE071();
            if (e071.length === 0) {
                Logger.info(`Customizing transport has no content, deleting.`, true);
                await transport.delete();
                context.runtime.transports.cust = context.runtime.transports.cust.filter(
                    trackedTransport => trackedTransport !== transport
                );
            }
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        for (const transport of context.runtime.transports.cust) {
            if (await transport.canBeDeleted()) {
                await transport.delete();
            }
        }
    }
}
