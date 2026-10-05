jest.mock('../checkPackageDependencies', () => ({
    checkPackageDependencies: jest.fn()
}));

import { Logger } from 'trm-commons';
import { checkPackageDependencies } from '../checkPackageDependencies';
import { checkDependencies } from './checkDependencies';

const workflowMock = checkPackageDependencies as jest.Mock;

function context() {
    return {
        rawInput: { packageData: { name: 'test' }, installData: { checks: {} }, contextData: { systemPackages: [] } },
        runtime: { package: { data: { manifest: { name: 'test', version: '1.0.0' } } } }
    } as any;
}

describe('install checkDependencies step', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['info', 'log', 'loading'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('queues only missing or mismatching dependencies for install', async () => {
        const ok = { name: 'ok', version: '*' };
        const missing = { name: 'missing', version: '*' };
        const old = { name: 'old', version: '^2.0.0' };
        workflowMock.mockResolvedValue({
            dependencies: [ok, missing, old],
            dependencyStatus: [
                { dependency: ok, match: true, status: 'ok' },
                { dependency: missing, match: false, status: 'notFound' },
                { dependency: old, match: false, status: 'versionMismatch' }
            ]
        });
        const ctx = context();
        await checkDependencies.run(ctx);
        expect(ctx.runtime.dependencies).toEqual([missing, old]);
    });

    test('aborts instead of reinstalling a dependency whose manifest is unreadable', async () => {
        const broken = { name: 'broken', version: '*' };
        workflowMock.mockResolvedValue({
            dependencies: [broken],
            dependencyStatus: [{ dependency: broken, match: false, status: 'manifestUnreadable' }]
        });
        const ctx = context();
        await expect(checkDependencies.run(ctx)).rejects.toThrow(/"broken".*manifest is unreadable/);
        expect(ctx.runtime.dependencies).toBeUndefined();
    });
});
