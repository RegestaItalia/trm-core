import { Step } from "@sammarks/workflow";
import { PublishWorkflowContext } from ".";
import { CliLogFileLogger, CliLogger, Logger } from "../../logger";

export const releaseCustTr: Step<PublishWorkflowContext> = {
    name: 'release-cust-tr',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if(context.runtime.custTransport){
            return true;
        }else{
            Logger.log(`Skipping CUST transport release because it wasn't generated`, true);
            return false;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const timeout = context.parsedInput.releaseTimeout;
        if(Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger){
            Logger.logger.forceStop();
        }
        await context.runtime.custTransport.release(false, true, null, timeout);
        context.runtime.tryCustDeleteRevert = false;
        //after trasport release cust transport has no revert option
        Logger.log(`CUST released, setting try revert to false as it cannot be deleted`, true);
    }
}