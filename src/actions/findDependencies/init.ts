import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { validateDevclass } from "../../inquirer";

export const init: Step<WorkflowContext> = {
    name: 'init',
    run: async (context: WorkflowContext): Promise<void> => {
        var devclass = context.rawInput.devclass;

        const devclassValid = await validateDevclass(devclass);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }

        context.parsedInput.devclass = devclass;
    }
}