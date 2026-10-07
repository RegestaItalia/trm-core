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

    test('guides the user before rejecting an incompatible upgrade', async () => {
        await expect(checkDependants.run(context('2.0.0', '^1.0.0'))).rejects.toThrow('Upgrade aborted');
        const messages = (Logger.info as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(messages).toContain('How to upgrade to "pkg" v2.0.0:');
        expect(messages).toContain('1. Install a newer release of "dependant"');
        expect(messages).toContain('2. If "pkg" v2.0.0 is still not installed, run this install again.');
        expect(messages).toContain('(^1.0.0)');
    });
});
