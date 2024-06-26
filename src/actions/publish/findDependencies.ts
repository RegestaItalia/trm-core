import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { FindDependencyActionInput } from "../findDependencies";
import { findDependencies as findDependenciesWkf } from "../findDependencies";

const SUBWORKFLOW_NAME = 'find-dependencies-sub-publish';

export const findDependencies: Step<PublishWorkflowContext> = {
    name: 'find-dependencies',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.skipDependencies) {
            Logger.info(`Skipping dependencies.`);
            Logger.warning(`Skipping dependencies can cause your package to fail activation. Make sure to manually edit the dependencies if necessary.`);
            return false;
        } else {
            if (context.runtime.tadirObjects.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping dependencies search beacuse no objects were found`, true);
                return false;
            }
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const inputData: FindDependencyActionInput = {
            devclass: context.parsedInput.devclass,
            tadir: context.runtime.tadirObjects,
            silent: context.parsedInput.silent || !context.parsedInput.skipDependencies
        };
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${JSON.stringify(inputData)}`, true);
        Logger.loading(`Searching package dependencies...`);
        const result = await findDependenciesWkf(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${JSON.stringify(result)}`, true);
        const aUnknownDependencyDevclass = (result.unknownDependencies).map(o => o.devclass);
        if(aUnknownDependencyDevclass.length > 0){
            throw new Error(`Dependencies found with packages ${aUnknownDependencyDevclass.join(', ')}: Unknown TRM package!`);
        }
        context.runtime.dependencies = result;
        //logger is stopped in logDependencies step
    }
}