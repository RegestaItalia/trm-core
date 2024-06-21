import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";

export const releaseTadirTr: Step<PublishWorkflowContext> = {
    name: 'release-tadir-tr',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const tmpFolder = context.parsedInput.releaseFolder;
        const timeout = context.parsedInput.releaseTimeout;
        await context.runtime.tadirTransport.release(false, false, tmpFolder, timeout);
        //after trasport release tadir transport has no revert option
        //adding this to skip trkorr table makes sense only after inserting it into src trkorr table
        //so in this step, the revert is disabled
        Logger.log(`TADIR released, setting try revert to false as it cannot be deleted`, true);
        context.runtime.tryTadirDeleteRevert = false;
    }
}