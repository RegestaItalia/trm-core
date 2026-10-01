import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckEnginesWorkflowContext } from ".";
import { normalizeEngines, validateEngines } from "../../manifest";

/**
 * Workflow step that initializes engines-check state from the supplied manifest.
 *
 * 1- validate and set engines (read manifest)
 *
 * 2- fill missing input data
 *
*/
export const init: Step<CheckEnginesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckEnginesWorkflowContext): Promise<void> => {
        context.output = {
            engines: {},
            passed: true,
            results: []
        };
        context.runtime = {};

        //1- validate and set engines
        const engines = context.rawInput.packageData.manifest.engines;
        if (engines) {
            const errors = validateEngines(engines);
            if (errors.length > 0) {
                throw new Error(`Invalid engines declaration: ${errors[0]}`);
            }
            context.output.engines = normalizeEngines(engines);
        }

        //2- fill missing input data
        if (!context.rawInput.printOptions) {
            context.rawInput.printOptions = {};
        }
    }
}
