import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { R3trans } from "node-r3trans";

export const setR3trans: Step<InstallWorkflowContext> = {
    name: 'set-R3trans',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const options = context.parsedInput.r3transOptions;
        const r3trans = new R3trans(options);
        const r3transVersion = await r3trans.getVersion();
        Logger.info(r3transVersion);
        context.runtime.r3trans = r3trans;
    }
}