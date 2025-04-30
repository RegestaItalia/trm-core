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
        if((context.rawInput.publishData.customizingTransports as Array<Transport>).length > 0){
            return true;
        }else{
            Logger.log(`Skipping CUST transport generation (no customizing transports)`, true);
            return false;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Generate CUST transport step', true);

        //1- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating CUST transport...`, true);
        context.runtime.systemData.custTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.CUST,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM: ${context.rawInput.packageData.name} v${context.rawInput.packageData.version} (C)`
        });
        await context.runtime.systemData.custTransport.addComment(`name=${context.rawInput.packageData.name}`);
        await context.runtime.systemData.custTransport.addComment(`version=${context.rawInput.packageData.version}`);
        for(const transport of (context.rawInput.publishData.customizingTransports as Array<Transport>)){
            await context.runtime.systemData.custTransport.addObjectsFromTransport(transport.trkorr);
        }
        //check transport has content (else delete)
        const e071 = await context.runtime.systemData.custTransport.getE071();
        if(e071.length === 0){
            Logger.info(`Customizing transport has no content, deleting.`, true);
            await context.runtime.systemData.custTransport.delete();
            context.runtime.systemData.custTransport = undefined;
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Rollback generate CUST transport step', true);
        if (context.runtime.systemData.custTransport) {
            try {
                if (await context.runtime.systemData.custTransport.canBeDeleted()) {
                    await context.runtime.systemData.custTransport.delete();
                    Logger.success(`Executed rollback on transport ${context.runtime.systemData.custTransport.trkorr}`, true);
                } else {
                    throw new Error(`Transport ${context.runtime.systemData.custTransport.trkorr} cannot be deleted (released?)`);
                }
            } catch (e) {
                Logger.error(`Unable to rollback transport ${context.runtime.systemData.custTransport.trkorr}!`);
                Logger.error(e.toString(), true);
            }
        }
    }
}