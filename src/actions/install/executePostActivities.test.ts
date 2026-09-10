jest.mock('../../manifest', () => ({
    PostActivity: class MockPostActivity {
        static execute = jest.fn();
        constructor(public data: any) {}
        execute() { return MockPostActivity.execute(this.data); }
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { PostActivity } from '../../manifest';
import { executePostActivities } from './executePostActivities';

function context() {
    return {
        rawInput: { installData: { skipPostActivities: false } },
        runtime: {
            package: { data: { manifest: { postActivities: [
                { name: 'ZCL_FIRST', parameters: [] },
                { name: 'ZCL_SECOND', parameters: [] }
            ] } } }
        },
        output: { transport: { trkorr: 'DEVK900001' } }
    } as any;
}

describe('executePostActivities rollback boundary', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'removePrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);
    });

    test('an activity exception is propagated so completed SAP edits can roll back', async () => {
        const ctx = context();
        const rollback = jest.fn().mockResolvedValue(undefined);
        (PostActivity as any).execute
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('activity failed'));
        const edited = { name: 'sap-edit', run: async () => undefined, revert: rollback };

        await expect(execute('test', [edited, executePostActivities], ctx)).rejects.toThrow();

        expect(rollback).toHaveBeenCalledTimes(1);
        expect(Logger.removePrefix).toHaveBeenCalledTimes(2);
    });

    test('landscape transport placeholder is resolved before execution', async () => {
        const ctx = context();
        ctx.runtime.package.data.manifest.postActivities = [{
            name: 'ZCL_ACTIVITY',
            parameters: [{ name: 'TRKORR', value: '&LANDSCAPE_TRANSPORT&' }]
        }];
        (PostActivity as any).execute.mockResolvedValue(undefined);

        await executePostActivities.run(ctx);

        expect(ctx.runtime.package.data.manifest.postActivities[0].parameters[0].value).toBe('DEVK900001');
    });
});
