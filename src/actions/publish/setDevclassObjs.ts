import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setDevclassObjs: Step<PublishWorkflowContext> = {
    name: 'set-devclass-objs',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const devclass = context.parsedInput.devclass;
        Logger.loading(`Reading package objects...`);
        context.runtime.tadirObjects = await SystemConnector.getDevclassObjects(devclass, true);
    }
}