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
import { installWithRollback } from '.';
import { TrmPackage } from '../../trmPackage';

function context() {
    return {
        rawInput: {
            contextData: { noInquirer: true, systemPackages: [] },
            installData: { installDevclass: {} }
        },
        runtime: {
            dependencies: [
                { dependency: { name: 'dep-one', version: '^1.0.0' }, status: 'notFound' },
                { dependency: { name: 'dep-two', version: '^2.0.0' }, status: 'versionMismatch', installedVersion: '3.0.0' }
            ],
            dependencyRollbacks: [],
            dependencyReleases: [],
            installedDependencies: []
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
        const releaseFirst = jest.fn().mockResolvedValue(undefined);
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, rollback: rollbackFirst, release: releaseFirst })
            .mockRejectedValueOnce(new Error('second dependency failed'));

        await expect(execute('test', [installDependencies], ctx)).rejects.toThrow();

        expect(rollbackFirst).toHaveBeenCalledTimes(1);
        expect(ctx.runtime.dependencyReleases).toEqual([releaseFirst]);
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

    test('lists incompatible dependencies separately from missing ones', async () => {
        const ctx = context();
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, rollback: jest.fn() })
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-two' } }, rollback: jest.fn() });

        await execute('test', [installDependencies], ctx);

        expect(Logger.info).toHaveBeenCalledWith('  1/2 dep-one ^1.0.0 (missing)');
        expect(Logger.info).toHaveBeenCalledWith('  2/2 dep-two ^2.0.0 (incompatible: v3.0.0 installed)');
    });

    test('asks to replace dependencies when one is installed in an incompatible version', async () => {
        const ctx = context();
        ctx.rawInput.contextData.noInquirer = false;
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ confirmInstall: false } as never);

        await expect(execute('test', [installDependencies], ctx)).rejects.toThrow('Install aborted.');

        expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ message: 'Install or replace dependencies?' }));
        expect(installDependency).not.toHaveBeenCalled();
    });

    test('a dependency already installed adds no rollback, and earlier dependencies still roll back on a later failure', async () => {
        const ctx = context();
        ctx.runtime.dependencies.push({ dependency: { name: 'dep-three', version: '^1.0.0' }, status: 'notFound' });
        const rollbackFirst = jest.fn().mockResolvedValue(undefined);
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, alreadyInstalled: false, rollback: rollbackFirst })
            .mockResolvedValueOnce({ alreadyInstalled: true, installedVersion: '2.1.0' })
            .mockRejectedValueOnce(new Error('third dependency failed'));

        await expect(execute('test', [installDependencies], ctx)).rejects.toThrow();

        expect(installDependency).toHaveBeenCalledTimes(3);
        expect(ctx.runtime.dependencyRollbacks).toEqual([rollbackFirst]);
        expect(rollbackFirst).toHaveBeenCalledTimes(1);
        expect(Logger.setPrefix).toHaveBeenLastCalledWith(undefined);
    });

    test('dependencies a parent install already confirmed are not asked again, and are passed on', async () => {
        const ctx = context();
        ctx.rawInput.contextData.noInquirer = false;
        ctx.rawInput.installData.approvedDependencies = ['dep-one', 'dep-two', 'dep-zero'];
        const prompt = jest.spyOn(Inquirer, 'prompt');
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        (installDependency as jest.Mock).mockResolvedValue({ alreadyInstalled: true });

        await installDependencies.run(ctx);

        expect(prompt).not.toHaveBeenCalled();
        expect((installDependency as jest.Mock).mock.calls[0][0].installData.approvedDependencies).toEqual(['dep-one', 'dep-two', 'dep-zero']);
    });

    test('a dependency not confirmed by the parent is asked', async () => {
        const ctx = context();
        ctx.rawInput.contextData.noInquirer = false;
        ctx.rawInput.installData.approvedDependencies = ['dep-one'];
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ confirmInstall: true });
        (installDependency as jest.Mock).mockResolvedValue({ alreadyInstalled: true });

        await installDependencies.run(ctx);

        expect(prompt).toHaveBeenCalledTimes(1);
        expect((installDependency as jest.Mock).mock.calls[0][0].installData.approvedDependencies).toEqual(['dep-one', 'dep-two']);
    });

    test('dependencies do not inherit the parent package mappings', async () => {
        const ctx = context();
        ctx.rawInput.installData.installDevclass = {
            keepOriginal: false,
            transportLayer: 'ZTRL',
            replacements: [{ originalDevclass: 'ZPARENT', installDevclass: 'ZRENAMED' }]
        };
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, rollback: jest.fn() })
            .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-two' } }, rollback: jest.fn() });

        await execute('test', [installDependencies], ctx);

        for (const [input] of (installDependency as jest.Mock).mock.calls) {
            expect(input.installData.installDevclass).toEqual({ transportLayer: 'ZTRL', replacements: [] });
        }
        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZPARENT', installDevclass: 'ZRENAMED' }
        ]);
    });

    test('on upgrade, dependency installs see the parent with the manifest being installed', async () => {
        const ctx = context();
        const installedParent = { packageName: 'parent', manifest: { value: { name: 'parent', version: '1.0.0' } } };
        const otherPackage = { packageName: 'other', manifest: { value: { name: 'other', version: '1.0.0' } } };
        ctx.rawInput.contextData.systemPackages = [installedParent, otherPackage];
        ctx.runtime.update = installedParent;
        ctx.runtime.package = { data: { manifest: { name: 'parent', version: '2.0.0', dependencies: [{ name: 'dep-one', version: '^2.0.0' }] } } };
        (TrmPackage.compare as jest.Mock).mockImplementation((a, b) => a.packageName === b.packageName);
        (installDependency as jest.Mock)
            .mockResolvedValueOnce({ alreadyInstalled: true })
            .mockResolvedValueOnce({ alreadyInstalled: true });

        await execute('test', [installDependencies], ctx);

        for (const [input] of (installDependency as jest.Mock).mock.calls) {
            const [parent, other] = input.contextData.systemPackages;
            expect(parent.manifest.value).toEqual(ctx.runtime.package.data.manifest);
            expect(other.manifest.value).toEqual({ name: 'other', version: '1.0.0' });
        }
        expect(installedParent.manifest.value).toEqual({ name: 'parent', version: '1.0.0' });
        (TrmPackage.compare as jest.Mock).mockImplementation(() => false);
    });

    test('dependency installs inherit the namespaces locked by the parent', async () => {
        const ctx = context();
        ctx.runtime.lockedNamespaces = ['/ACME/'];
        (installDependency as jest.Mock).mockImplementation(async (_input, runner) => {
            await runner({ packageData: { name: 'dep' } });
            return { alreadyInstalled: true };
        });

        await execute('test', [installDependencies], ctx);

        expect(installWithRollback).toHaveBeenCalledWith({ packageData: { name: 'dep' } }, ['/ACME/']);
    });

    describe('transitive installs (diamond A->B->D, A->C->D)', () => {
        const D = { packageName: 'dep-shared' };

        beforeEach(() => {
            (TrmPackage.compare as jest.Mock).mockImplementation((a, b) => a.packageName === b.packageName);
        });

        afterEach(() => {
            (TrmPackage.compare as jest.Mock).mockImplementation(() => false);
        });

        test('a package installed by one dependency is in the snapshot of the next one', async () => {
            const ctx = context();
            const seenByC: string[][] = [];
            (installDependency as jest.Mock)
                .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, installedPackages: [D], rollback: jest.fn() })
                .mockImplementationOnce(async input => {
                    seenByC.push(input.contextData.systemPackages.map((o: any) => o.packageName));
                    return { installOutput: { manifest: { name: 'dep-two' } }, rollback: jest.fn() };
                });

            await execute('test', [installDependencies], ctx);

            expect(seenByC).toEqual([['dep-shared', 'dep-one']]);
            expect(ctx.rawInput.contextData.systemPackages.map((o: any) => o.packageName)).toEqual(['dep-shared', 'dep-one', 'dep-two']);
            expect(ctx.runtime.installedDependencies.map((o: any) => o.packageName)).toEqual(['dep-shared', 'dep-one', 'dep-two']);
        });

        test('a transitive install replaces the snapshot entry of the same package', async () => {
            const ctx = context();
            const previousD = { packageName: 'dep-shared', old: true };
            ctx.rawInput.contextData.systemPackages = [previousD];
            (installDependency as jest.Mock)
                .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, installedPackages: [D], rollback: jest.fn() })
                .mockResolvedValueOnce({ alreadyInstalled: true });

            await execute('test', [installDependencies], ctx);

            expect(ctx.rawInput.contextData.systemPackages).toEqual([D, expect.objectContaining({ packageName: 'dep-one' })]);
        });

        test('a later failure rolls back and restores the snapshot taken before the dependency installs', async () => {
            const ctx = context();
            const existing = { packageName: 'existing' };
            ctx.rawInput.contextData.systemPackages = [existing];
            const snapshot = ctx.rawInput.contextData.systemPackages;
            const rollbackFirst = jest.fn().mockResolvedValue(undefined);
            (installDependency as jest.Mock)
                .mockResolvedValueOnce({ installOutput: { manifest: { name: 'dep-one' } }, installedPackages: [D], rollback: rollbackFirst })
                .mockRejectedValueOnce(new Error('second dependency failed'));

            await expect(execute('test', [installDependencies], ctx)).rejects.toThrow('second dependency failed');

            expect(rollbackFirst).toHaveBeenCalledTimes(1);
            expect(ctx.rawInput.contextData.systemPackages).toBe(snapshot);
            expect(snapshot).toEqual([existing]);
            expect(ctx.runtime.installedDependencies).toEqual([]);
        });

        test('the snapshot is kept when a dependency rollback fails', async () => {
            const ctx = context();
            ctx.rawInput.contextData.systemPackages = [D];
            ctx.runtime.systemPackagesBeforeDependencies = [];
            ctx.runtime.dependencyRollbacks = [jest.fn().mockRejectedValue(new Error('rollback failed'))];

            await expect(installDependencies.revert(ctx)).rejects.toThrow('rollback failed');

            expect(ctx.rawInput.contextData.systemPackages).toEqual([D]);
        });
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
