import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { validateDevclass } from "../../inquirer";

export const init: Step<FindDependenciesWorkflowContext> = {
    name: 'init',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var devclass = context.rawInput.devclass;

        const devclassValid = await validateDevclass(devclass, true);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }

        context.parsedInput.devclass = devclass;
        context.parsedInput.deepCheck = context.rawInput.deepCheck ? true : false;
        context.parsedInput.print = context.rawInput.print ? true : false;
    }
}