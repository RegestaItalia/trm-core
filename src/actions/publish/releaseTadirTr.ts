import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { CliLogFileLogger, CliLogger, Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";


export const releaseTadirTr: Step<WorkflowContext> = {
    name: 'release-tadir-tr',
    run: async (context: WorkflowContext): Promise<void> => {
        const tmpFolder = context.parsedInput.releaseFolder;
        const timeout = context.parsedInput.releaseTimeout;
        if(Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger){
            Logger.logger.forceStop();
        }
        await context.runtime.tadirTransport.release(false, false, tmpFolder, timeout);
    },
    revert: async (context: WorkflowContext): Promise<void> => {
        context.runtime.skipTadirTransportDelete = true;
        Logger.loading(`Rollback TADIR transport ${context.runtime.tadirTransport.trkorr}...`);
        await SystemConnector.addSkipTrkorr(context.runtime.tadirTransport.trkorr);
        Logger.info(`Executed rollback on transport ${context.runtime.tadirTransport.trkorr}`);
    }
}