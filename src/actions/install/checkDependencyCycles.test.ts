const releases: Record<string, Record<string, any>> = {};
const registry = {
    endpoint: 'public',
    compare: (other: any) => other.endpoint === 'public',
    getPackage: jest.fn(async (name: string, version: string) => {
        const versions = releases[name];
        if (!versions) throw new Error(`Package "${name}" not found`);
        if (version === 'latest') return { versions: Object.keys(versions) };
        return { manifest: versions[version] };
    })
};
jest.mock('../../registry', () => ({
    ...jest.requireActual('../../registry/RegistryType'),
    RegistryProvider: { getRegistry: jest.fn(() => registry) }
}));
jest.mock('..', () => ({ installDependency: jest.fn() }));
jest.mock('.', () => ({ installWithRollback: jest.fn() }));

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { installDependency } from '..';
import { TrmPackage } from '../../trmPackage';
import { checkDependencyCycles } from './checkDependencyCycles';
import { installDependencies } from './installDependencies';

function release(name: string, version: string, dependencies: [string, string][] = []) {
    releases[name] ||= {};
    releases[name][version] = { name, version, dependencies: dependencies.map(([n, v]) => ({ name: n, version: v })) };
}

function installed(name: string, version: string, dependencies: [string, string][] = []) {
    const manifest = { name, version, dependencies: dependencies.map(([n, v]) => ({ name: n, version: v })) };
    return new TrmPackage(name, registry as any, { get: () => manifest } as any);
}

function context(dependencies: [string, string][], systemPackages: TrmPackage[] = [], checks: any = {}) {
    const manifest = { name: 'root', version: '1.0.0', dependencies: dependencies.map(([n, v]) => ({ name: n, version: v })) };
    return {
        rawInput: {
            packageData: { name: 'root', registry },
            contextData: { noInquirer: true, systemPackages },
            installData: { checks, installDevclass: {} }
        },
        runtime: {
            package: { data: { manifest } },
            dependencies: manifest.dependencies.map(dependency => ({ dependency, status: 'notFound' })),
            dependencyRollbacks: [],
            dependencyReleases: []
        }
    } as any;
}

describe('install checkDependencyCycles step', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const key of Object.keys(releases)) delete releases[key];
        for (const method of ['info', 'log', 'loading', 'setPrefix'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
    });

    test('replacing an installed dependency another installed package still needs is rejected before any prompt', async () => {
        release('c', '1.0.0');
        release('c', '2.0.0');
        const systemPackages = [installed('c', '1.0.0'), installed('a', '1.0.0', [['c', '^1.0.0']])];
        await expect(checkDependencyCycles.run(context([['c', '^2.0.0']], systemPackages)))
            .rejects.toThrow('Install aborted: dependency "c" would be replaced with v2.0.0, but installed package "a" requires ^1.0.0. Upgrade "a" first.');
    });

    test('replacing an installed dependency compatible with the other installed packages is allowed', async () => {
        release('c', '1.0.0');
        release('c', '1.1.0');
        const systemPackages = [installed('c', '1.0.0'), installed('a', '1.0.0', [['c', '^1.0.0']])];
        await expect(checkDependencyCycles.run(context([['c', '^1.1.0']], systemPackages))).resolves.toBeUndefined();
    });

    test('a dependency installed from a .trm file is not installed again from the registry', async () => {
        release('c', '1.0.0');
        const local = { endpoint: 'local', name: 'local', compare: (other: any) => other.endpoint === 'local', getRegistryType: () => 3 };
        const registryWithName = Object.assign(registry, { name: 'public', getRegistryType: () => 1 });
        const systemPackages = [new TrmPackage('c', local as any, { get: () => ({ name: 'c', version: '1.0.0' }) } as any)];
        await expect(checkDependencyCycles.run(context([['c', '^1.0.0']], systemPackages)))
            .rejects.toThrow('Install aborted: dependency "c" must be installed from registry public, but it\'s installed from a .trm file. Delete it, then install again.');
        expect(registryWithName.getPackage).not.toHaveBeenCalled();
    });

    test('a self dependency is rejected', async () => {
        await expect(checkDependencyCycles.run(context([['root', '^1.0.0']])))
            .rejects.toThrow('cyclic dependency detected "root" -> "root"');
        expect(registry.getPackage).not.toHaveBeenCalled();
    });

    test('a transitive cycle through registry releases is rejected', async () => {
        release('a', '1.0.0', [['b', '^1.0.0']]);
        release('b', '1.0.0', [['root', '*']]);
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']])))
            .rejects.toThrow('cyclic dependency detected "root" -> "a" -> "b" -> "root"');
    });

    test('a cycle not involving the installed package is rejected', async () => {
        release('a', '1.0.0', [['b', '^1.0.0']]);
        release('b', '1.0.0', [['a', '^1.0.0']]);
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']])))
            .rejects.toThrow('"a" -> "b" -> "a"');
    });

    test('the release that would be installed is the one inspected', async () => {
        release('a', '1.0.0', [['root', '*']]);
        release('a', '1.1.0');
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']]))).resolves.toBeUndefined();
        expect(registry.getPackage).toHaveBeenCalledWith('a', '1.1.0');
    });

    test('a compatible installed dependency is not walked, even if it depends back on the package', async () => {
        // e.g. "a" was installed with noDependencies: installing "root" does not install "a" again.
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']], [installed('a', '1.2.0', [['root', '*']])])))
            .resolves.toBeUndefined();
        expect(registry.getPackage).not.toHaveBeenCalled();
    });

    test('a dependency back to the package is not a loop when its installed version satisfies the range', async () => {
        release('a', '1.0.0', [['root', '^1.0.0']]);
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']], [installed('root', '1.0.0')])))
            .resolves.toBeUndefined();
    });

    test('a dependency back to the package loops when its installed version does not satisfy the range', async () => {
        release('a', '1.0.0', [['root', '^2.0.0']]);
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']], [installed('root', '1.0.0')])))
            .rejects.toThrow('"root" -> "a" -> "root"');
    });

    test('an incompatible installed dependency is walked through the registry release', async () => {
        release('a', '2.0.0', [['root', '*']]);
        await expect(checkDependencyCycles.run(context([['a', '^2.0.0']], [installed('a', '1.0.0')])))
            .rejects.toThrow('"root" -> "a" -> "root"');
    });

    test('a lockfile pins the inspected release', async () => {
        release('a', '1.0.0', [['root', '*']]);
        release('a', '1.1.0');
        const lockfile = { getLock: jest.fn(() => ({ name: 'a', version: '1.0.0' })) };
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']], [], { lockfile })))
            .rejects.toThrow('"root" -> "a" -> "root"');
    });

    test('a lockfile without the dependency walks the newest release in range', async () => {
        release('a', '1.0.0');
        release('a', '1.1.0', [['root', '*']]);
        const lockfile = { getLock: jest.fn(() => undefined) };
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0']], [], { lockfile })))
            .rejects.toThrow('"root" -> "a" -> "root"');
    });

    test('a shared dependency (diamond) is not a cycle and is resolved once', async () => {
        release('a', '1.0.0', [['c', '^1.0.0']]);
        release('b', '1.0.0', [['c', '^1.0.0']]);
        release('c', '1.0.0');
        await expect(checkDependencyCycles.run(context([['a', '^1.0.0'], ['b', '^1.0.0']]))).resolves.toBeUndefined();
        expect((registry.getPackage as jest.Mock).mock.calls.filter(([name, version]) => name === 'c' && version === '1.0.0')).toHaveLength(1);
    });

    describe('version conflicts', () => {
        test('a shared dependency selected outside a later range is rejected', async () => {
            release('a', '1.0.0', [['c', '^1.0.0']]);
            release('b', '1.0.0', [['c', '^2.0.0']]);
            release('c', '1.0.0');
            release('c', '2.0.0');
            await expect(checkDependencyCycles.run(context([['a', '^1.0.0'], ['b', '^1.0.0']])))
                .rejects.toThrow('dependency "c" version conflict: "a" requires ^1.0.0 (v1.0.0 to install), "b" requires ^2.0.0');
        });

        test('a shared dependency satisfying every range is accepted', async () => {
            release('a', '1.0.0', [['c', '^1.0.0']]);
            release('b', '1.0.0', [['c', '>=1.1.0']]);
            release('c', '1.0.0');
            release('c', '1.2.0');
            await expect(checkDependencyCycles.run(context([['a', '^1.0.0'], ['b', '^1.0.0']]))).resolves.toBeUndefined();
        });

        test('a kept installed dependency conflicts with a later range', async () => {
            release('a', '1.0.0', [['c', '^1.0.0']]);
            release('b', '1.0.0', [['c', '^2.0.0']]);
            release('c', '2.0.0');
            await expect(checkDependencyCycles.run(context([['a', '^1.0.0'], ['b', '^1.0.0']], [installed('c', '1.0.0')])))
                .rejects.toThrow('"a" requires ^1.0.0 (v1.0.0 installed), "b" requires ^2.0.0');
        });

        test('a dependency replaced earlier in the run conflicts with a later range its installed version satisfied', async () => {
            release('a', '1.0.0', [['c', '^2.0.0']]);
            release('b', '1.0.0', [['c', '^1.0.0']]);
            release('c', '2.0.0');
            await expect(checkDependencyCycles.run(context([['a', '^1.0.0'], ['b', '^1.0.0']], [installed('c', '1.0.0')])))
                .rejects.toThrow('"a" requires ^2.0.0 (v2.0.0 to install), "b" requires ^1.0.0');
        });

        test('a direct dependency of the root conflicts with the version a nested dependency planned', async () => {
            release('a', '1.0.0', [['c', '^1.0.0']]);
            release('c', '1.0.0');
            release('c', '2.0.0');
            await expect(checkDependencyCycles.run(context([['a', '^1.0.0'], ['c', '^2.0.0']])))
                .rejects.toThrow('"a" requires ^1.0.0 (v1.0.0 to install), "root" requires ^2.0.0');
        });

        test('a conflict aborts the workflow before any dependency is installed', async () => {
            release('a', '1.0.0', [['c', '^1.0.0']]);
            release('b', '1.0.0', [['c', '^2.0.0']]);
            release('c', '1.0.0');
            release('c', '2.0.0');
            await expect(execute('test', [checkDependencyCycles, installDependencies], context([['a', '^1.0.0'], ['b', '^1.0.0']])))
                .rejects.toThrow('version conflict');
            expect(installDependency).not.toHaveBeenCalled();
        });
    });

    test('the check is skipped when dependencies are skipped', async () => {
        expect(await checkDependencyCycles.filter(context([['root', '*']], [], { noDependencies: true }))).toBe(false);
    });

    test('a cycle aborts the workflow before any dependency is installed', async () => {
        release('a', '1.0.0', [['root', '*']]);
        await expect(execute('test', [checkDependencyCycles, installDependencies], context([['a', '^1.0.0']])))
            .rejects.toThrow('cyclic dependency detected');
        expect(installDependency).not.toHaveBeenCalled();
    });
});
