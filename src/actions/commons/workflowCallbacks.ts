import { inspect, Logger } from "trm-commons";
import { Step, WorkflowCallbacks } from "@simonegaffurini/sammarksworkflow";

/**
 * Default callbacks used by TRM actions to log workflow, step, and rollback lifecycle events.
 * Sensitive callers should note that workflow inputs and outputs are included in verbose logs.
 */
export const workflowCallbacks: WorkflowCallbacks<any> = {
    onWorkflowStart: (name: string, context: any) => {
        Logger.log(`Starting workflow "${name}", input data: ${inspect(context.rawInput || context, { breakLength: Infinity, compact: true })}`, true);
    },
    onWorkflowFinish(name: string, context: any) {
        Logger.log(`Workflow ${name} result: ${inspect(context.output || context, { breakLength: Infinity, compact: true })}`, true);
    },
    onStepStart(step: Step<any>) {
        Logger.log(`Starting "${step.name}" step`, true);
    },
    onStepCompleted(step: Step<any>) {
        Logger.log(`Completed "${step.name}" step`, true);
    },
    onStepFail(step: Step<any>, error: Error) {
        Logger.log(`Failed "${step.name}" step: ${error.message}`, true);
    },
    onRevertStart(step, context) {
        Logger.log(`Starting revert "${step.name}" step`, true);
    },
    onRevertCompleted(step: Step<any>) {
        Logger.log(`Completed revert "${step.name}" step`, true);
    },
    onRevertFailed(step: Step<any>, error: Error) {
        Logger.error(`Failed rollback: ${error.message}`);
        Logger.log(`Failed revert "${step.name}" step: ${error.message}`, true);
    },
};
