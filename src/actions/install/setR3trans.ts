import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { R3trans } from "node-r3trans";

/**
 * Create R3trans instance
 * 
 * 1- create instance
 * 
 * 2- print info (if requested)
 * 
*/
export const setR3trans: Step<InstallWorkflowContext> = {
    name: 'set-r3trans',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Set R3trans step', true);

        Logger.loading(`Loading R3Trans...`);
        
        //1- create instance
        const options = context.rawInput.contextData.r3transOptions;
        Logger.log(`Loading R3Trans with options ${JSON.stringify(options)}`, true);
        context.runtime.r3trans = new R3trans(options);
        
        //2- print info (if requested)
        const r3transVersion = await context.runtime.r3trans.getVersion();
        const unicode = await context.runtime.r3trans.isUnicode();
        Logger.info(r3transVersion, context.rawInput.contextData.noR3transInfo);
        Logger.log(`R3Trans unicode?: ${unicode}`, true);
    }
}