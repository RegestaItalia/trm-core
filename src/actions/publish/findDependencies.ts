import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";
import { TadirDependency } from "../findTadirDependencies";
import { findTadirDependencies } from "../../actions/findTadirDependencies";

export const findDependencies: Step<WorkflowContext> = {
    name: 'find-dependencies',
    filter: async (context: WorkflowContext): Promise<boolean> => {
        if (context.rawInput.skipDependencies) {
            Logger.info(`Skipping dependencies.`);
            Logger.warning(`Skipping dependencies can cause your package to fail activation. Make sure to manually edit the dependencies if necessary.`);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: WorkflowContext): Promise<void> => {
        var tadirDependencies: TadirDependency[] = [];
        const devclass = context.parsedInput.devclass;
        const tadir = context.runtime.tadirObjects;
        Logger.loading(`Searching dependencies...`);
        /*tadirDependencies = await findTadirDependencies({
            devclass,
            tadir
        });*/
    }
}