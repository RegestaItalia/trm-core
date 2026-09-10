jest.mock('..', () => ({ installDependency: jest.fn() }));
jest.mock('.', () => ({ installWithRollback: jest.fn() }));
jest.mock('../../registry', () => ({
    RegistryProvider: { getRegistry: jest.fn(() => ({ endpoint: 'registry' })) }
}));
jest.mock('../../manifest', () => ({ Manifest: class MockManifest { constructor(public value: any) {} } }));
jest.mock('../../trmPackage', () => ({
    TrmPackage: class MockTrmPackage {
        static compare = jest.fn(() => false);
        constructor(public packageName: string) {}
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { installDependency } from '..';
import { installDependencies } from './installDependencies';

function context() {
    return {
        rawInput: {
            contextData: { noInquirer: true, systemPackages: [] },
            installData: { installDevclass: {} }
        },
        runtime: {
            dependencies: [
                { name: 'dep-one', version: '^1.0.0' },
                { name: 'dep-two', version: '^2.0.0' }
            ],
            dependencyRollbacks: []
        }
    } as any;
}

describe('nested dependency rollback ownership', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['info', 'loading', 'setPrefix'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
    });

    test('a completed dependency is rolled back when the next dependency fails', async () => {
        const ctx = context();
        const rollbackFirst = jest.fn().mockResolvedValue(undefined);
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, rollback: rollbackFirst })
            .mockRejectedValueOnce(new Error('second dependency failed'));

        await expect(execute('test', [installDependencies], ctx)).rejects.toThrow();

        expect(rollbackFirst).toHaveBeenCalledTimes(1);
    });

    test('all completed dependencies roll back in reverse order after a later parent failure', async () => {
        const ctx = context();
        const order: string[] = [];
        const rollbackFirst = jest.fn(async () => { order.push('first'); });
        const rollbackSecond = jest.fn(async () => { order.push('second'); });
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, rollback: rollbackFirst })
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-two' } }, rollback: rollbackSecond });
        const failLater = { name: 'parent-failure', run: async () => { throw new Error('parent failed'); } };

        await expect(execute('test', [installDependencies, failLater], ctx)).rejects.toThrow();

        expect(order).toEqual(['second', 'first']);
    });

    test('one dependency rollback failure does not skip earlier dependencies', async () => {
        const ctx = context();
        const rollbackFirst = jest.fn().mockResolvedValue(undefined);
        const rollbackSecond = jest.fn().mockRejectedValue(new Error('rollback failed'));
        ctx.runtime.dependencyRollbacks = [rollbackFirst, rollbackSecond];

        await expect(installDependencies.revert(ctx)).rejects.toThrow('rollback failed');

        expect(rollbackSecond).toHaveBeenCalledTimes(1);
        expect(rollbackFirst).toHaveBeenCalledTimes(1);
    });
});
