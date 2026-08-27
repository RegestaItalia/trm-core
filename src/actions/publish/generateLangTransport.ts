import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";

/**
 * Workflow step that creates the optional transport containing language data.
 * 
 * 1- generate transport
 * 
*/
export const generateLangTransport: Step<PublishWorkflowContext> = {
    name: 'generate-lang-transport',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.rawInput.publishData.noLanguageTransport) {
            Logger.log(`Skipping LANG transport generation (user input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('publish');
        }
        //1- generate transport
        Logger.loading(`Generating transports...`);
        Logger.loading(`Generating LANG transport...`, true);
        const aDevc = context.runtime.sapPackage.objects.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC');
        context.runtime.transports.lang = await Transport.createToc({
            trmIdentifier: TrmTransportIdentifier.LANG,
            target: context.rawInput.systemData.transportTarget,
            text: `@X1@TRM (L) ${context.rawInput.packageData.name} v${context.rawInput.packageData.version}`.slice(0, 60)
        });
        var iLanguageObjects: number = 0;
        try {
            await context.runtime.transports.lang.addTranslations(aDevc.map(o => o.objName));
            iLanguageObjects = (await context.runtime.transports.lang.getE071()).length;
        } catch (e) {
            Logger.warning(`Language transport generation error: ${e.toString()}`);
        } finally {
            if (iLanguageObjects === 0) {
                Logger.info(`Language transport has no content, deleting.`, true);
                await context.runtime.transports.lang.delete();
                context.runtime.transports.lang = undefined;
            }
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        if (context.runtime.transports.lang) {
            if (await context.runtime.transports.lang.canBeDeleted()) {
                await context.runtime.transports.lang.delete();
            }
        }
    }
}
