import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";

export const releaseDevcTr: Step<WorkflowContext> = {
    name: 'release-devc-tr',
    run: async (context: WorkflowContext): Promise<void> => {
        const tmpFolder = context.parsedInput.releaseFolder;
        const timeout = context.parsedInput.releaseTimeout;
        Logger.loading(`Finalizing release...`);
        await context.runtime.devcTransport.release(false, true, tmpFolder, timeout);
    }
}