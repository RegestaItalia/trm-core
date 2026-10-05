const registry = {
    endpoint: 'public',
    compare: (other: any) => other.endpoint === 'public',
    getRegistryType: () => 'PUBLIC',
    getPackage: jest.fn(async (_name: string, _version: string): Promise<any> => ({ versions: ['1.0.0', '1.2.0', '2.0.0'] }))
};
jest.mock('../../registry', () => ({
    RegistryType: { LOCAL: 'LOCAL' },
    RegistryProvider: { getRegistry: jest.fn(() => registry) }
}));
jest.mock('..', () => ({ install: jest.fn() }));

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { Lockfile } from '../../lockfile';
import { TrmPackage } from '../../trmPackage';
import { init } from './init';
import { checkInstalledRelease } from './checkInstalledRelease';
import { findInstallRelease } from './findInstallRelease';
import { confirmDowngrade } from './confirmDowngrade';
import { installRelease } from './installRelease';

const steps = [init, checkInstalledRelease, findInstallRelease, confirmDowngrade, installRelease];

function installed(version: any) {
    return new TrmPackage('dep', registry as any, { get: () => ({ name: 'dep', version }) } as any);
}

function unreadable() {
    return new TrmPackage('dep', registry as any, { get: () => { throw new Error('bad manifest'); } } as any);
}

function lockfile(version: string, name = 'dep') {
    return Lockfile.fromJson({
        lockfileVersion: 1,
        source: 'TRM',
        packages: [{ name, version, registry: 'public', integrity: 'sha' }]
    } as any);
}

function context(systemPackages: TrmPackage[], versionRange = '^1.0.0', checks: any = {}, noInquirer = true) {
    const rollback = jest.fn();
    const installRunner = jest.fn(async (input: any) => ({
        output: { manifest: { name: 'dep', version: input.packageData.version } },
        rollback,
        release: jest.fn()
    }));
    return {
        rawInput: {
            dependencyDataPackage: { name: 'dep', versionRange, registry },
            contextData: { noInquirer, systemPackages },
            installData: { checks }
        },
        installRunner
    } as any;
}

async function run(ctx: any) {
    return execute('install-dependency', steps, ctx);
}

describe('installDependency installed-release handling', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['info', 'log', 'loading', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    test('a compatible installed release is kept and nothing is installed', async () => {
        const ctx = context([installed('1.0.0')]);
        const result = await run(ctx);
        expect(result.runtime.alreadyInstalled).toBe(true);
        expect(result.runtime.installedVersion).toBe('1.0.0');
        expect(ctx.installRunner).not.toHaveBeenCalled();
        expect(registry.getPackage).not.toHaveBeenCalled();
    });

    test('the newest in-range release already installed is a no-op instead of an error', async () => {
        const ctx = context([installed('1.2.0')]);
        const result = await run(ctx);
        expect(result.runtime.alreadyInstalled).toBe(true);
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a missing dependency installs the newest release in range', async () => {
        const ctx = context([]);
        const result = await run(ctx);
        expect(result.runtime.alreadyInstalled).toBe(false);
        expect(ctx.installRunner).toHaveBeenCalledWith(expect.objectContaining({
            packageData: expect.objectContaining({ version: '1.2.0' })
        }));
    });

    test('an older incompatible release is upgraded without a downgrade prompt', async () => {
        const ctx = context([installed('0.9.0')], '^1.0.0', {}, false);
        const prompt = jest.spyOn(Inquirer, 'prompt');
        await run(ctx);
        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.installRunner).toHaveBeenCalledWith(expect.objectContaining({
            packageData: expect.objectContaining({ version: '1.2.0' })
        }));
    });

    test('a downgrade aborts without a prompt unless allowed', async () => {
        const ctx = context([installed('2.0.0')]);
        await expect(run(ctx)).rejects.toThrow('"dep" v2.0.0 would be downgraded to v1.2.0');
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a declined downgrade prompt aborts the install', async () => {
        const ctx = context([installed('2.0.0')], '^1.0.0', {}, false);
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ confirmDowngrade: false } as never);
        await expect(run(ctx)).rejects.toThrow('would be downgraded');
        expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a confirmed downgrade prompt installs the selected release', async () => {
        const ctx = context([installed('2.0.0')], '^1.0.0', {}, false);
        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ confirmDowngrade: true } as never);
        await run(ctx);
        expect(ctx.installRunner).toHaveBeenCalledWith(expect.objectContaining({
            packageData: expect.objectContaining({ version: '1.2.0' })
        }));
    });

    test('allowDowngrade confirms the downgrade in advance', async () => {
        const ctx = context([installed('2.0.0')], '^1.0.0', { allowDowngrade: true });
        await run(ctx);
        expect(ctx.installRunner).toHaveBeenCalledTimes(1);
    });

    test('an unreadable installed manifest aborts before any release is selected', async () => {
        const ctx = context([unreadable()]);
        await expect(run(ctx)).rejects.toThrow('"dep": package is installed but its manifest is unreadable');
        expect(registry.getPackage).not.toHaveBeenCalled();
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('an installed release equal to the lock is kept', async () => {
        const testLock = jest.spyOn(Lockfile, 'testReleaseByLock');
        const ctx = context([installed('1.0.0')], '^1.0.0', { lockfile: lockfile('1.0.0') });
        const result = await run(ctx);
        expect(result.runtime.alreadyInstalled).toBe(true);
        expect(testLock).not.toHaveBeenCalled();
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a lock pinning another compatible version is honoured', async () => {
        jest.spyOn(Lockfile, 'testReleaseByLock').mockResolvedValue(true);
        const ctx = context([installed('1.2.0')], '^1.0.0', { lockfile: lockfile('1.0.0'), allowDowngrade: true });
        const result = await run(ctx);
        expect(result.runtime.alreadyInstalled).toBe(false);
        expect(ctx.installRunner).toHaveBeenCalledWith(expect.objectContaining({
            packageData: expect.objectContaining({ version: '1.0.0' })
        }));
    });

    test('a lock pinning an older compatible version still requires downgrade confirmation', async () => {
        jest.spyOn(Lockfile, 'testReleaseByLock').mockResolvedValue(true);
        const ctx = context([installed('1.2.0')], '^1.0.0', { lockfile: lockfile('1.0.0') });
        await expect(run(ctx)).rejects.toThrow('"dep" v1.2.0 would be downgraded to v1.0.0');
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a lockfile without the dependency falls back to the newest release in range', async () => {
        const testLock = jest.spyOn(Lockfile, 'testReleaseByLock');
        const ctx = context([], '^1.0.0', { lockfile: lockfile('1.0.0', 'other') });
        await run(ctx);
        expect(testLock).not.toHaveBeenCalled();
        expect(Logger.info).toHaveBeenCalledWith('Dependency "dep" not in lockfile, using v1.2.0 (>=1.0.0 <2.0.0-0).');
        expect(ctx.installRunner).toHaveBeenCalledWith(expect.objectContaining({
            packageData: expect.objectContaining({ version: '1.2.0' })
        }));
    });

    test('a lockfile without the dependency keeps a compatible installed release', async () => {
        const ctx = context([installed('1.0.0')], '^1.0.0', { lockfile: lockfile('1.0.0', 'other') });
        const result = await run(ctx);
        expect(result.runtime.alreadyInstalled).toBe(true);
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a lock outside the range aborts with a distinct error', async () => {
        const ctx = context([], '^1.0.0', { lockfile: lockfile('2.0.0') });
        await expect(run(ctx)).rejects.toThrow('pins v2.0.0, which does not satisfy');
        expect(registry.getPackage).not.toHaveBeenCalled();
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });

    test('a lock outside the range aborts even with a compatible installed release', async () => {
        const ctx = context([installed('1.0.0')], '^1.0.0', { lockfile: lockfile('2.0.0') });
        await expect(run(ctx)).rejects.toThrow('pins v2.0.0, which does not satisfy');
        expect(ctx.installRunner).not.toHaveBeenCalled();
    });
});
