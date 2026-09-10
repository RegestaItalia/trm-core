import execute, { Step } from "@simonegaffurini/sammarksworkflow";

/** Executes a workflow and retains a one-shot, best-effort rollback journal after success. */
export async function executeRetainedWorkflow<T extends object>(
    name: string,
    steps: Step<T>[],
    context: T,
    callbacks?: any
): Promise<{ context: T, rollback: () => Promise<void> }> {
    const completed: Step<T>[] = [];
    const tracked = steps.map(step => ({
        ...step,
        run: async (stepContext: T): Promise<void> => {
            await step.run(stepContext);
            completed.push(step);
        }
    }));
    const result = await execute<T>(name, tracked, context, callbacks);
    let rolledBack = false;
    return {
        context: result,
        rollback: async (): Promise<void> => {
            if (rolledBack) {
                return;
            }
            rolledBack = true;
            let firstError: unknown;
            for (const step of [...completed].reverse()) {
                if (!step.revert) {
                    continue;
                }
                try {
                    await step.revert(result);
                } catch (error) {
                    firstError ||= error;
                }
            }
            if (firstError) {
                throw firstError;
            }
        }
    };
}
