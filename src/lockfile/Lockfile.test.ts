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
        expect(() => lockfile('2.0.0-beta.1').getLock(dep, '^1.0.0')).toThrow('Lock for package "dep"');
    });
});
