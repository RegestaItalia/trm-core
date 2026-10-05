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
