import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { CliLogFileLogger, CliLogger, Logger } from "../../logger";

export const releaseLangTr: Step<WorkflowContext> = {
    name: 'release-tadir-tr',
    filter: async (context: WorkflowContext): Promise<boolean> => {
        if(context.runtime.langTransport){
            return true;
        }else{
            Logger.log(`Skipping LANG transport release because it wasn't generated or there are no language entries`, true);
            return false;
        }
    },
    run: async (context: WorkflowContext): Promise<void> => {
        const tmpFolder = context.parsedInput.releaseFolder;
        const timeout = context.parsedInput.releaseTimeout;
        if(Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger){
            Logger.logger.forceStop();
        }
        await context.runtime.langTransport.release(false, false, tmpFolder, timeout);
        context.runtime.tryLangDeleteRevert = false;
        //after trasport release lang transport has no revert option
        Logger.log(`LANG released, setting try revert to false as it cannot be deleted`, true);
    }
}