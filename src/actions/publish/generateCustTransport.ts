import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";

/**
 * Generate CUST transport
 * 
 * 1- generate transport
 * 
*/
export const generateCustTransport: Step<PublishWorkflowContext> = {
    name: 'generate-cust-transport',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.runtime.systemData.originCustomizing.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping CUST transport generation (no customizing transports)`, true);
            return false;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Generate CUST transport step', true);

        //1- generate transport
        Logger.loading(`Generating transports...`);
        for (const origin of context.runtime.systemData.originCustomizing) {
            Logger.loading(`Generating CUST transport...`, true);
            const transport = await Transport.createToc({
                trmIdentifier: TrmTransportIdentifier.CUST,
                target: context.rawInput.systemData.transportTarget,
                text: `@X1@TRM: ${context.rawInput.packageData.name} v${context.rawInput.packageData.version} (C) ${origin.description}`.trim()
            });
            for (const originTransport of origin.transports) {
                await transport.addObjectsFromTransport(originTransport.trkorr);
            }
            //check transport has content (else delete)
            const e071 = await transport.getE071();
            if (e071.length === 0) {
                Logger.info(`Customizing transport has no content, deleting.`, true);
                await transport.delete();
            } else {
                context.runtime.systemData.custTransports.push(transport);
            }
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Rollback generate CUST transport step', true);
        for (const transport of context.runtime.systemData.custTransports) {
            try {
                if (await transport.canBeDeleted()) {
                    await transport.delete();
                    Logger.success(`Executed rollback on transport ${transport.trkorr}`, true);
                }
            } catch (e) {
                Logger.error(`Unable to rollback transport ${transport.trkorr}!`);
                Logger.error(e.toString(), true);
            }
        }
    }
}