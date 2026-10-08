import { WorkflowError, WorkflowRevertError } from '@simonegaffurini/sammarksworkflow';
import { ActionWorkflowRevertError, executeWorkflow } from './workflowCallbacks';

describe('executeWorkflow', () => {
    test('returns the context when every step succeeds', async () => {
        const context = { done: false };

        await expect(executeWorkflow('test', [
            { name: 'one', run: async ctx => { ctx.done = true; } }
        ], context, {})).resolves.toBe(context);
        expect(context.done).toBe(true);
    });

    test('throws the step failure when the rollback is clean', async () => {
        const revert = jest.fn().mockResolvedValue(undefined);

        const error = await executeWorkflow('test', [
            { name: 'one', run: async () => undefined, revert },
            { name: 'failure', run: async () => { throw new Error('step failed'); } }
        ], {}, {}).catch(e => e);

        expect(revert).toHaveBeenCalledTimes(1);
        expect(error).not.toBeInstanceOf(ActionWorkflowRevertError);
        expect(error.revertErrors).toBeUndefined();
        expect(error.stepName).toBe('failure');
        expect(error.originalException.message).toBe('step failed');
        expect(error.message).toBe(`Workflow error executing 'failure': step failed`);
        expect(error.stack.split('\n')[0]).toBe(`Error: Workflow error executing 'failure': step failed`);
    });

    test('describes a nested workflow failure with the step path and the root cause', async () => {
        const error = await executeWorkflow('outer', [
            {
                name: 'check-engines', run: async () => {
                    await executeWorkflow('inner', [
                        { name: 'check', run: async () => { throw new Error('engines not met'); } }
                    ], {}, {});
                }
            }
        ], {}, {}).catch(e => e);

        expect(error.message).toBe(`Workflow error executing 'check-engines' > 'check': engines not met`);
        expect(error.originalException.originalException.message).toBe('engines not met');
    });

    test('keeps non-Error step failures readable', async () => {
        const error = await executeWorkflow('test', [
            { name: 'failure', run: async () => { throw 'plain failure'; } }
        ], {}, {}).catch(e => e);

        expect(error.message).toBe(`Workflow error executing 'failure': plain failure`);
    });

    test('attempts every revert and throws a WorkflowRevertError with all rollback failures', async () => {
        const events: string[] = [];
        const onRevertFailed = jest.fn();

        const error = await executeWorkflow('test', [
            { name: 'one', run: async () => undefined, revert: async () => { events.push('one'); throw new Error('one revert failed'); } },
            { name: 'two', run: async () => undefined, revert: async () => { events.push('two'); } },
            { name: 'three', run: async () => undefined, revert: async () => { events.push('three'); throw new Error('three revert failed'); } },
            { name: 'failure', run: async () => { throw new Error('step failed'); } }
        ], {}, { onRevertFailed }).catch(e => e);

        expect(events).toEqual(['three', 'two', 'one']);
        expect(onRevertFailed).toHaveBeenCalledTimes(2);
        expect(error).toBeInstanceOf(WorkflowRevertError);
        expect(error).toBeInstanceOf(WorkflowError);
        expect(error).toBeInstanceOf(ActionWorkflowRevertError);
        expect(error.name).toBe('ActionWorkflowRevertError');
        expect(error.originalWorkflowError.stepName).toBe('failure');
        expect(error.originalWorkflowError.originalException.message).toBe('step failed');
        expect(error.revertErrors.map((e: WorkflowError) => [e.stepName, e.originalException.message])).toEqual([
            ['three', 'three revert failed'],
            ['one', 'one revert failed']
        ]);
        expect(error.stepName).toBe('three');
        expect(error.originalException.message).toBe('three revert failed');
        expect(error.message).toBe([
            `Workflow error executing 'failure': step failed`,
            `Additionally, error reverting step 'three': three revert failed`,
            `Additionally, error reverting step 'one': one revert failed`
        ].join('\n'));
    });

    test('collects rollback failures per execution', async () => {
        const failing = () => executeWorkflow('test', [
            { name: 'one', run: async () => undefined, revert: async () => { throw new Error('revert failed'); } },
            { name: 'failure', run: async () => { throw new Error('step failed'); } }
        ], {}, {}).catch(e => e);

        const [first, second] = await Promise.all([failing(), failing()]);

        expect(first.revertErrors).toHaveLength(1);
        expect(second.revertErrors).toHaveLength(1);
    });
});
