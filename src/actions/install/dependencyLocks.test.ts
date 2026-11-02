jest.mock('../commons', () => ({
    ...jest.requireActual('../commons'),
    executeWorkflow: jest.fn()
}));
jest.mock('../commons/utils', () => ({
    ...jest.requireActual('../commons/utils'),
    executeRetainedWorkflow: jest.fn(),
    resolveInstallPackage: jest.fn(),
    getMissingTrmBackendApis: jest.fn()
}));

import { Step } from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { ClientError } from '../../client';
import { SystemConnector } from '../../systemConnector';
import { executeWorkflow } from '../commons';
import { ActionLockScope, actionLockKey, executeRetainedWorkflow, getMissingTrmBackendApis, LockResource, resolveInstallPackage } from '../commons/utils';
import { install, installWithRollback, InstallWorkflowContext } from '.';
import { installDependencies } from './installDependencies';

type Scenario = {
    children?: string[];
    fail?: boolean;
    rollbackFail?: boolean;
};

const shared: LockResource[] = [
    { type: 'OBJECT', name: 'R3TR VDAT SWFDVEVTYNOOPT' },
    { type: 'DEVCLASS', name: '/ACME/SHARED' },
    { type: 'NAMESPACE', name: '/ACME/' },
    { type: 'TRANSPORT', name: 'DEVK900001' },
    { type: 'PACKAGE', name: 'shared [registry]' }
];

/** Exercise the real install entry points and workflow rollback engine, replacing SAP work only. */
describe('dependency tree action lock ownership', () => {
    const registry = { endpoint: 'registry', getRegistryType: () => 2 };
    const input = (name: string) => ({ packageData: { name, registry } } as any);
    const acquire = jest.spyOn(SystemConnector, 'acquireActionLocks');
    const release = jest.spyOn(SystemConnector, 'releaseActionLocks');
    let held: Map<string, string>;
    let events: string[];
    let scenarios: Record<string, Scenario>;
    let releaseFails: boolean;
    let warning: jest.SpyInstance;

    function steps(context: InstallWorkflowContext): Step<InstallWorkflowContext>[] {
        const name = context.rawInput.packageData.name;
        const scenario = scenarios[name] || {};
        return [
            {
                name: 'init-test',
                run: async ctx => {
                    ctx.runtime = { dependencyRollbacks: [], dependencyReleases: [], installedDependencies: [] } as any;
                    ctx.output = { manifest: { name } } as any;
                }
            },
            { name: 'lock-test', run: async ctx => { await ctx.lockScope.acquire(shared); } },
            {
                name: 'dependencies-test',
                run: async ctx => {
                    for (const child of scenario.children || []) {
                        const retained = await installWithRollback(input(child), [], ctx.lockScope);
                        ctx.runtime.dependencyRollbacks.push(retained.rollback);
                        ctx.runtime.dependencyReleases.push(retained.release);
                        // A child's release callback must not unlock the tree.
                        await retained.release();
                        expect(held.size).toBeGreaterThan(0);
                        expect(release).not.toHaveBeenCalled();
                    }
                },
                revert: installDependencies.revert
            },
            {
                name: 'mutation-test',
                run: async () => {
                    events.push(`work:${name}`);
                    if (scenario.fail) throw new Error(`work failed:${name}`);
                },
                revert: async () => {
                    events.push(`rollback:${name}`);
                    for (const resource of shared) {
                        expect(held.has(actionLockKey(resource).resourceHash)).toBe(true);
                    }
                    if (scenario.rollbackFail) throw new Error(`rollback failed:${name}`);
                }
            }
        ];
    }

    beforeEach(() => {
        held = new Map();
        events = [];
        scenarios = {};
        releaseFails = false;
        warning = jest.spyOn(Logger, 'warning').mockImplementation(() => undefined);
        acquire.mockReset().mockImplementation(async (keys, owner) => {
            for (const key of keys) {
                const existing = held.get(key.resourceHash);
                if (existing && existing !== owner) {
                    throw new ClientError('ENQUEUE_ERROR', { class: '00', no: '001' }, `Action lock held: ${key.resourceName}`);
                }
            }
            keys.forEach(key => held.set(key.resourceHash, owner));
        });
        release.mockReset().mockImplementation(async (keys, owner) => {
            events.push('release');
            if (releaseFails) throw new Error('release failed');
            keys.forEach(key => {
                if (held.get(key.resourceHash) === owner) held.delete(key.resourceHash);
            });
        });
        (resolveInstallPackage as jest.Mock).mockReset().mockImplementation(async (source, name) => ({ registry: source, name }));
        (getMissingTrmBackendApis as jest.Mock).mockReset().mockResolvedValue([]);
        (executeWorkflow as jest.Mock).mockReset().mockImplementation((name, _steps, ctx) =>
            jest.requireActual('../commons').executeWorkflow(name, steps(ctx), ctx, {}));
        (executeRetainedWorkflow as jest.Mock).mockReset().mockImplementation((name, _steps, ctx) =>
            jest.requireActual('../commons/utils/retainedWorkflow').executeRetainedWorkflow(name, steps(ctx), ctx));
    });

    afterEach(() => warning.mockRestore());

    test('parent, sibling and transitive installs share all resource types and release once', async () => {
        scenarios = { root: { children: ['first', 'second'] }, first: { children: ['grandchild'] } };

        await expect(install(input('root'))).resolves.toMatchObject({ manifest: { name: 'root' } });

        expect(new Set(acquire.mock.calls.map(call => call[1])).size).toBe(1);
        for (const resource of shared) {
            const hash = actionLockKey(resource).resourceHash;
            expect(acquire.mock.calls.flatMap(call => call[0]).filter(key => key.resourceHash === hash)).toHaveLength(1);
        }
        expect(release).toHaveBeenCalledTimes(1);
        expect(events.at(-1)).toBe('release');
        expect(held.size).toBe(0);
    });

    test('independent top-level installs still conflict and cannot release the original owner', async () => {
        const first = await installWithRollback(input('first'));
        const original = new Map(held);

        await expect(install(input('second'))).rejects.toThrow('Action lock held');

        expect(held).toEqual(original);
        expect(acquire.mock.calls.at(-1)[1]).not.toBe(acquire.mock.calls[0][1]);
        await first.release();
        expect(held.size).toBe(0);
    });

    test('a failed child keeps locks held through sibling rollback, even when rollback and release fail', async () => {
        scenarios = {
            root: { children: ['first', 'second', 'broken'] },
            first: {}, second: { rollbackFail: true }, broken: { fail: true }
        };
        releaseFails = true;

        await expect(install(input('root'))).rejects.toThrow('work failed:broken');

        expect(events.indexOf('rollback:second')).toBeLessThan(events.indexOf('rollback:first'));
        expect(events.indexOf('rollback:first')).toBeLessThan(events.indexOf('release'));
        expect(release).toHaveBeenCalledTimes(1);
        expect(warning).toHaveBeenCalledWith(expect.stringContaining('release failed'), { important: true });
    });

    test('a later parent failure rolls back the tree before releasing its locks', async () => {
        scenarios = { root: { children: ['first', 'second'], fail: true }, first: { children: ['grandchild'] } };

        await expect(install(input('root'))).rejects.toThrow('work failed:root');

        const rollbacks = events.filter(event => event.startsWith('rollback:'));
        expect(rollbacks).toContain('rollback:grandchild');
        expect(rollbacks.indexOf('rollback:second')).toBeLessThan(rollbacks.indexOf('rollback:first'));
        expect(events.at(-1)).toBe('release');
        expect(release).toHaveBeenCalledTimes(1);
        expect(held.size).toBe(0);
    });

    test('retained rollback attempts every dependency and reports the first failure after cleanup', async () => {
        scenarios = {
            root: { children: ['first', 'second'] },
            first: { rollbackFail: true }, second: { rollbackFail: true }
        };
        const retained = await installWithRollback(input('root'));

        await expect(retained.rollback()).rejects.toThrow('rollback failed:second');

        expect(events).toContain('rollback:first');
        expect(events.at(-1)).toBe('release');
        expect(held.size).toBe(0);
        await retained.release();
        expect(release).toHaveBeenCalledTimes(1);
    });

    test('an ordinary dependency cannot borrow a disabled backend-upgrade scope', async () => {
        const parent = new ActionLockScope('install', false);
        acquire.mockRejectedValueOnce(new Error('METHOD_CALL_EXCEPTION'));

        await expect(installWithRollback(input('ordinary'), [], parent)).rejects.toThrow('METHOD_CALL_EXCEPTION');

        expect(acquire).toHaveBeenCalledTimes(1);
        expect(executeRetainedWorkflow).not.toHaveBeenCalled();
    });
});
