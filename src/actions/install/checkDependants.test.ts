import { Logger } from 'trm-commons';
import { RegistryProvider } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { checkDependants } from './checkDependants';

function installed(name: string, dependencies: any[] = []) {
    return new TrmPackage(name, RegistryProvider.getRegistry(), {
        get: () => ({ name, version: '1.0.0', dependencies })
    } as any);
}

function context(upgradedVersion: string, range: string) {
    const pkg = installed('pkg');
    const dependant = installed('dependant', [{ name: 'pkg', version: range, registry: undefined }]);
    return {
        rawInput: { contextData: { systemPackages: [pkg, dependant] } },
        runtime: { update: pkg, package: { data: { manifest: { version: upgradedVersion } } } }
    } as any;
}

describe('install checkDependants', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['info', 'error'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('accepts a prerelease upgrade inside the dependant range', async () => {
        await expect(checkDependants.run(context('1.3.0-beta.1', '>=1.0.0'))).resolves.toBeUndefined();
    });

    test('rejects a prerelease upgrade outside the dependant range', async () => {
        await expect(checkDependants.run(context('2.0.0-beta.1', '^1.0.0'))).rejects.toThrow('Upgrade aborted');
    });
});
