import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { CliLogFileLogger, CliLogger, Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";


export const releaseTadirTr: Step<WorkflowContext> = {
    name: 'release-tadir-tr',
    run: async (context: WorkflowContext): Promise<void> => {
        const tmpFolder = context.parsedInput.releaseFolder;
        const timeout = context.parsedInput.releaseTimeout;
        if (Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger) {
            Logger.logger.forceStop();
        }
        await context.runtime.tadirTransport.release(false, false, tmpFolder, timeout);
        context.runtime.tryTadirDeleteRevert = false;
    }
}