jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getPackageIntegrity: jest.fn()
    }
}));

import { SystemConnector } from '../systemConnector';
import { RegistryProvider } from '../registry';
import { TrmPackage } from '../trmPackage';
import { Lockfile } from './Lockfile';

function lockfile(version: string) {
    return Lockfile.fromJson({
        lockfileVersion: 1,
        source: 'TRM',
        packages: [{ name: 'dep', version, registry: RegistryProvider.getRegistry().endpoint, integrity: 'sha' }]
    });
}

describe('Lockfile.getLock', () => {
    const dep = new TrmPackage('dep', RegistryProvider.getRegistry());

    test('returns a locked prerelease satisfying the range', () => {
        expect(lockfile('1.3.0-beta.1').getLock(dep, '>=1.0.0').version).toBe('1.3.0-beta.1');
    });

    test('rejects a locked version outside the range', () => {
        expect(() => lockfile('2.0.0-beta.1').getLock(dep, '^1.0.0')).toThrow(/Lock for package "dep".*pins v2\.0\.0-beta\.1, which does not satisfy \^1\.0\.0/);
    });

    test('returns undefined when the lockfile has no entry for the package', () => {
        expect(lockfile('1.0.0').getLock(new TrmPackage('other', RegistryProvider.getRegistry()), '^1.0.0')).toBeUndefined();
    });

    test('returns undefined when the lockfile has no packages', () => {
        expect(Lockfile.fromJson({ lockfileVersion: 1, source: 'TRM' }).getLock(dep, '^1.0.0')).toBeUndefined();
    });
});

describe('Lockfile integrity', () => {
    const registry = RegistryProvider.getRegistry();

    function installed(name: string, dependencies: any[] = []) {
        return new TrmPackage(name, registry, { get: () => ({ name, version: '1.0.0', dependencies }) } as any);
    }

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('generation refuses a dependency without integrity', async () => {
        (SystemConnector.getPackageIntegrity as jest.Mock).mockResolvedValue('');
        const root = installed('root', [{ name: 'dep', version: '^1.0.0', registry: registry.endpoint }]);

        await expect(Lockfile.generate(root, [installed('dep')])).rejects.toThrow(/integrity of dependency "dep".*is missing in system TST/);
    });

    test('generation records the dependency integrity', async () => {
        (SystemConnector.getPackageIntegrity as jest.Mock).mockResolvedValue('sha');
        const root = installed('root', [{ name: 'dep', version: '^1.0.0', registry: registry.endpoint }]);

        const lock = await Lockfile.generate(root, [installed('dep')]);
        expect(lock.lockfile.packages).toEqual([{ name: 'dep', version: '1.0.0', registry: registry.endpoint, integrity: 'sha' }]);
    });

    test('a lock without integrity is rejected before contacting the registry', async () => {
        const getRegistry = jest.spyOn(RegistryProvider, 'getRegistry');

        await expect(Lockfile.testReleaseByLock({ name: 'dep', version: '1.0.0', registry: registry.endpoint, integrity: '' }))
            .rejects.toThrow('has no integrity: regenerate the lockfile');
        expect(getRegistry).not.toHaveBeenCalled();
    });
});
