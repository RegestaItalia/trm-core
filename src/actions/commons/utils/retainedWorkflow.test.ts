import { executeRetainedWorkflow } from './retainedWorkflow';

describe('executeRetainedWorkflow', () => {
    test('retains completed steps and rolls them back once in reverse order', async () => {
        const events: string[] = [];
        const retained = await executeRetainedWorkflow('test', [
            { name: 'one', run: async () => { events.push('run-one'); }, revert: async () => { events.push('revert-one'); } },
            { name: 'skip', filter: async () => false, run: async () => { events.push('run-skip'); }, revert: async () => { events.push('revert-skip'); } },
            { name: 'two', run: async () => { events.push('run-two'); }, revert: async () => { events.push('revert-two'); } }
        ], {});

        await retained.rollback();
        await retained.rollback();

        expect(events).toEqual(['run-one', 'run-two', 'revert-two', 'revert-one']);
    });

    test('attempts every retained revert even when one fails', async () => {
        const events: string[] = [];
        const retained = await executeRetainedWorkflow('test', [
            { name: 'one', run: async () => undefined, revert: async () => { events.push('one'); } },
            { name: 'two', run: async () => undefined, revert: async () => { events.push('two'); throw new Error('two failed'); } },
            { name: 'three', run: async () => undefined, revert: async () => { events.push('three'); } }
        ], {});

        await expect(retained.rollback()).rejects.toThrow('two failed');

        expect(events).toEqual(['three', 'two', 'one']);
    });

    test('a workflow failure uses the normal rollback and does not return a retained journal', async () => {
        const revert = jest.fn().mockResolvedValue(undefined);

        await expect(executeRetainedWorkflow('test', [
            { name: 'one', run: async () => undefined, revert },
            { name: 'failure', run: async () => { throw new Error('failed'); } }
        ], {})).rejects.toThrow();

        expect(revert).toHaveBeenCalledTimes(1);
    });
});
