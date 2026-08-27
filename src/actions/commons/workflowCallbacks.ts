import { inspect, Logger } from "trm-commons";
import { Step, WorkflowCallbacks } from "@simonegaffurini/sammarksworkflow";
import { summarizeForLog } from "../../commons";

/**
 * Default callbacks used by TRM actions to log workflow, step, and rollback lifecycle events.
 * Inputs and outputs are summarized with secrets redacted and binary/class instances collapsed.
 */
export const workflowCallbacks: WorkflowCallbacks<any> = {
    onWorkflowStart: (name: string, context: any) => {
        Logger.log(`Starting workflow "${name}", input data: ${inspect(summarizeForLog(context.rawInput || context), { breakLength: Infinity, compact: true })}`, true);
    },
    onWorkflowFinish(name: string, context: any) {
        Logger.log(`Workflow ${name} result: ${inspect(summarizeForLog(context.output || context), { breakLength: Infinity, compact: true })}`, true);
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
