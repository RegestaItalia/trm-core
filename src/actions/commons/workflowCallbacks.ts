import { Inquirer, inspect, Logger } from "trm-commons";
import execute, { Step, StepContext, WorkflowCallbacks, WorkflowError, WorkflowRevertError } from "@simonegaffurini/sammarksworkflow";
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
        Logger.setPrefix(`(Rollback) `);
        Inquirer.setPrefix(`(Rollback) `);
    },
    onRevertCompleted(step: Step<any>) {
        Logger.removePrefix();
        Inquirer.removePrefix();
        Logger.log(`Completed revert "${step.name}" step`, true);
    },
    onRevertFailed(step: Step<any>, error: Error) {
        Logger.removePrefix();
        Inquirer.removePrefix();
        Logger.error(`Failed rollback: ${error.message}`);
        Logger.log(`Failed revert "${step.name}" step: ${error.message}`, true);
    },
};

/**
 * Thrown by {@link executeWorkflow} when a step fails and one or more rollback steps fail too.
 * `originalWorkflowError` is the step failure; `revertErrors` holds every rollback failure, in
 * rollback order. `stepName` and `originalException` describe the first rollback failure.
 */
export class ActionWorkflowRevertError extends WorkflowRevertError {
    constructor(originalWorkflowError: WorkflowError, public revertErrors: WorkflowError[]) {
        super(revertErrors[0].stepName, revertErrors[0].originalException, originalWorkflowError);
        // The engine's ES5 error classes return a plain Error: restore the prototype chain for `instanceof`.
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = 'ActionWorkflowRevertError';
        this.message = [
            `Workflow error executing '${originalWorkflowError.stepName}': ${originalWorkflowError.originalException}`,
            ...revertErrors.map(revertError => `Additionally, error reverting step '${revertError.stepName}': ${revertError.originalException}`)
        ].join('\n');
    }
}

/**
 * Executes a workflow with `callbacks`. The engine only reports rollback failures to
 * `onRevertFailed` and rethrows the step failure: they are collected here, so a failed rollback
 * is thrown as an {@link ActionWorkflowRevertError} carrying all of them.
 */
export async function executeWorkflow<T extends StepContext>(
    name: string,
    steps: Array<Step<T>>,
    context: T,
    callbacks: WorkflowCallbacks<T> = workflowCallbacks
): Promise<T> {
    const revertErrors: WorkflowError[] = [];
    try {
        return await execute<T>(name, steps, context, {
            ...callbacks,
            onRevertFailed: (step: Step<T>, error: Error, stepContext: T) => {
                revertErrors.push(new WorkflowError(step.name, error));
                callbacks.onRevertFailed?.(step, error, stepContext);
            }
        });
    } catch (error) {
        // Reverts only run after a step failure, which the engine always rethrows as a WorkflowError
        // (checked by shape: its ES5 classes don't support `instanceof`).
        if (revertErrors.length > 0 && typeof error?.stepName === 'string' && 'originalException' in error) {
            throw new ActionWorkflowRevertError(error, revertErrors);
        }
        throw error;
    }
}
