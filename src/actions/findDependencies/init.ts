import { Step } from "@sammarks/workflow";
import { FindDependenciesPublishWorkflowContext } from ".";
import { validateDevclass } from "../../inquirer";

export const init: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'init',
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        var devclass = context.rawInput.devclass;

        const devclassValid = await validateDevclass(devclass);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }

        context.parsedInput.devclass = devclass;
        context.parsedInput.deepCheck = context.rawInput.deepCheck ? true : false;
    }
}