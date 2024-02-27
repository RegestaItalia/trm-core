import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";
import { validateDevclass } from "../../inquirer";

export const init: Step<WorkflowContext> = {
    name: 'init',
    run: async (context: WorkflowContext): Promise<void> => {
        var devclass = context.rawInput.devclass;
        var tadirObjects = context.rawInput.tadir || [];

        const devclassValid = await validateDevclass(devclass);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }

        context.parsedInput.devclass = devclass;

        if (tadirObjects.length === 0) {
            Logger.loading(`Reading package objects...`);
            context.parsedInput.tadir = await SystemConnector.getDevclassObjects(devclass, true);
        }
    }
}