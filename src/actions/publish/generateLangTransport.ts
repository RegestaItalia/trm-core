import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Transport, TrmTransportIdentifier } from "../../transport";

/**
 * Generate LANG transport
 * 
 * 1- generate transport
 * 
*/
export const generateLangTransport: Step<PublishWorkflowContext> = {
    name: 'generate-lang-transport',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if(context.rawInput.publishData.noLanguageTransport){
            Logger.log(`Skipping LANG transport generation (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Generate LANG transport step', true);

        //1- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating LANG transport...`, true);
        const aTadir = context.runtime.packageData.tadir.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        context.runtime.systemData.langTransport = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.LANG,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM: ${context.rawInput.packageData.name} v${context.rawInput.packageData.version} (L)`
        });
        var iLanguageObjects: number = 0;
        try {
            await context.runtime.systemData.langTransport.addTranslations(aTadir.map(o => o.objName));
            iLanguageObjects = (await context.runtime.systemData.langTransport.getE071()).length;
        } catch (e) {
            Logger.warning(`Language transport generation error!`);
            Logger.error(e, true);
        } finally {
            if (iLanguageObjects === 0) {
                Logger.info(`Language transport has no content, deleting.`, true);
                await context.runtime.systemData.langTransport.delete();
                context.runtime.systemData.langTransport = undefined;
            }
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Rollback generate LANG transport step', true);
        if (context.runtime.systemData.langTransport) {
            try {
                if (await context.runtime.systemData.langTransport.canBeDeleted()) {
                    await context.runtime.systemData.langTransport.delete();
                    Logger.success(`Executed rollback on transport ${context.runtime.systemData.langTransport.trkorr}`, true);
                } else {
                    throw new Error(`Transport ${context.runtime.systemData.langTransport.trkorr} cannot be deleted (released?)`);
                }
            } catch (e) {
                Logger.error(`Unable to rollback transport ${context.runtime.systemData.langTransport.trkorr}!`);
                Logger.error(e.toString(), true);
            }
        }
    }
}