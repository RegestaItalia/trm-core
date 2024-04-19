import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Logger } from "../../logger";


export const generateCustTr: Step<PublishWorkflowContext> = {
    name: 'generate-cust-tr',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.runtime.inputCustTransports.length > 0) {
            Logger.log(`Skipping CUST transport (no input in step)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const customizingTransports = context.runtime.inputCustTransports;
        Logger.loading(`Generating CUST transport...`);
        context.runtime.custTransport = await Transport.createToc({
            target: context.parsedInput.trTarget,
            text: `@X1@TRM: ${context.runtime.manifest.name} v${context.runtime.manifest.version} (C)`,
            trmIdentifier: TrmTransportIdentifier.CUST
        });
        context.runtime.tryCustDeleteRevert = true;
        for(const transport of customizingTransports){
            await context.runtime.custTransport.addObjectsFromTransport(transport.trkorr);
        }
        //check transport has content (else delete)
        var e071 = await context.runtime.custTransport.getE071();
        e071 = e071.filter(o => !(o.pgmid === 'CORR' && o.object === 'MERG'));
        if(e071.length === 0){
            Logger.info(`Customizing transport has no content.`);
            await context.runtime.custTransport.delete();
            delete context.runtime.custTransport;
            context.runtime.tryCustDeleteRevert = false;
        }else{
            //check custTr contains R3TR TABU only
            const wrongEntries = e071.filter(o => !(o.pgmid === 'R3TR' && o.object === 'TABU'));
            if(wrongEntries.length > 0){
                throw new Error(`Customizing transport contains invalid objects.`);
            }
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        if(context.runtime.tryCustDeleteRevert){
            Logger.loading(`Rollback CUST transport ${context.runtime.custTransport.trkorr}...`);
            try {
                const canBeDeleted = await context.runtime.custTransport.canBeDeleted();
                if (canBeDeleted) {
                    await context.runtime.custTransport.delete();
                    Logger.info(`Executed rollback on transport ${context.runtime.custTransport.trkorr}`);
                } else {
                    throw new Error(`Transport ${context.runtime.custTransport.trkorr} cannot be deleted`);
                }
            } catch (e) {
                Logger.info(`Unable to rollback transport ${context.runtime.custTransport.trkorr}`);
                Logger.error(e.toString(), true);
            }
        }
    }
}