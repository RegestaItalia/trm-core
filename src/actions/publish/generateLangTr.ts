import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Transport } from "../../transport";
import { Logger } from "../../logger";
import { TADIR } from "../../client";


export const generateLangTr: Step<WorkflowContext> = {
    name: 'generate-lang-tr',
    filter: async (context: WorkflowContext): Promise<boolean> => {
        if (context.rawInput.skipLang) {
            Logger.log(`Skipping LANG transport (input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: WorkflowContext): Promise<void> => {
        Logger.loading(`Generating LANG transport...`);
        const devcOnly: TADIR[] = context.runtime.tadirObjects.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC');
        context.runtime.langTransport = await Transport.createLang({
            target: context.parsedInput.trTarget,
            text: `@X1@TRM: ${context.runtime.manifest.name} v${context.runtime.manifest.version} (L)`
        });
        var iLanguageObjects: number = 0;
        try {
            await context.runtime.langTransport.addTranslations(devcOnly.map(o => o.objName));
            iLanguageObjects = (await context.runtime.langTransport.getE071()).length;
            context.runtime.tryLangDeleteRevert = true;
        } catch (e) {
            Logger.warning(`Language transport generation error (${e.toString()})`);
        } finally {
            if (iLanguageObjects === 0) {
                await context.runtime.langTransport.delete();
                delete context.runtime.langTransport;
                context.runtime.tryLangDeleteRevert = false;
            }
        }
    },
    revert: async (context: WorkflowContext): Promise<void> => {
        if(context.runtime.tryLangDeleteRevert && context.runtime.langTransport.trkorr){
            Logger.loading(`Rollback LANG transport ${context.runtime.langTransport.trkorr}...`);
            try {
                const canBeDeleted = await context.runtime.langTransport.canBeDeleted();
                if (canBeDeleted) {
                    await context.runtime.langTransport.delete();
                    Logger.info(`Executed rollback on transport ${context.runtime.langTransport.trkorr}`);
                } else {
                    throw new Error(`Transport ${context.runtime.langTransport.trkorr} cannot be deleted`);
                }
            } catch (e) {
                Logger.info(`Unable to rollback transport ${context.runtime.langTransport.trkorr}`);
                Logger.error(e.toString(), true);
            }
        }
    }
}