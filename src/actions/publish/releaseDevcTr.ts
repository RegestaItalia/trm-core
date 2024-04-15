import { Step } from "@sammarks/workflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";

export const releaseDevcTr: Step<PublishWorkflowContext> = {
    name: 'release-devc-tr',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const timeout = context.parsedInput.releaseTimeout;
        Logger.loading(`Finalizing release...`);
        await context.runtime.devcTransport.release(false, true, null, timeout);
        //after trasport release devc transport has no revert option
        Logger.log(`DEVC released, setting try revert to false as it cannot be deleted`, true);
        context.runtime.tryDevcDeleteRevert = false;
    }
}