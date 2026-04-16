import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { setTransportTarget as prompt } from "../commons/prompts";

/**
 * Set publish release transport target
 * 
*/
export const setTransportTarget: Step<PublishWorkflowContext> = {
    name: 'set-transport-target',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set transport target step', true);

        context.rawInput.systemData.transportTarget = await prompt(
            context.rawInput.contextData.noInquirer,
            context.runtime.systemData.transportTargets,
            context.rawInput.systemData.transportTarget,
            "Publish transport target"
        );
    }
}