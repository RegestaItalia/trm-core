jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        isTransportLayerExist: jest.fn(),
        getDefaultTransportLayer: jest.fn(),
        getTransportTargets: jest.fn()
    },
    TRM_REST_PACKAGE_NAME: 'trm-rest',
    TRM_SERVER_PACKAGE_NAME: 'trm-server'
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { RegistryType } from '../../registry';
import { init } from './init';
import { Lockfile } from '../../lockfile';

describe('install release integrity', () => {
    function context(integrity?: string) {
        return {
            rawInput: {
                packageData: {
                    name: 'dep',
                    version: '1.0.0',
                    integrity,
                    registry: {
                        name: 'test',
                        getRegistryType: () => 'PUBLIC',
                        getPackage: jest.fn(async () => ({
                            name: 'dep',
                            checksum: 'registry-sha',
                            manifest: { name: 'dep', version: '1.0.0' },
                            transports: []
                        }))
                    }
                },
                contextData: { systemPackages: [] },
                installData: { installDevclass: { transportLayer: 'ZLAYER' } }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'error', 'info', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        //reaching the next system call means the integrity check passed
        (SystemConnector.isTransportLayerExist as jest.Mock).mockRejectedValue(new Error('past integrity check'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('aborts before any system change when the fetched release does not match', async () => {
        await expect(init.run(context('locked-sha'))).rejects.toThrow('Cannot continue due to security issues.');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Expected SHA is locked-sha'), { important: true });
        expect(SystemConnector.isTransportLayerExist).not.toHaveBeenCalled();
    });

    test('an empty expected integrity is never accepted', async () => {
        await expect(init.run(context(''))).rejects.toThrow('Cannot continue due to security issues.');
    });

    test('continues when the fetched release matches', async () => {
        await expect(init.run(context('registry-sha'))).rejects.toThrow('past integrity check');
        expect(SystemConnector.isTransportLayerExist).toHaveBeenCalledWith('ZLAYER');
    });

    test('continues without an expected integrity', async () => {
        await expect(init.run(context())).rejects.toThrow('past integrity check');
    });

    test('no transport layer lookup happens when none is specified', async () => {
        const ctx = context();
        delete ctx.rawInput.installData.installDevclass.transportLayer;
        //the landscape target lookup follows the transport layer check
        (SystemConnector.getTransportTargets as jest.Mock).mockRejectedValue(new Error('past layer check'));
        await expect(init.run(ctx)).rejects.toThrow('past layer check');
        expect(SystemConnector.isTransportLayerExist).not.toHaveBeenCalled();
        expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
    });

    test('the input name is replaced with the registry manifest name', async () => {
        const ctx = context();
        ctx.rawInput.packageData.name = 'DEP';
        await expect(init.run(ctx)).rejects.toThrow('past integrity check');
        expect(ctx.rawInput.packageData.registry.getPackage).toHaveBeenCalledWith('DEP', '1.0.0');
        // install mappings and transports are queried and written under this name
        expect(ctx.rawInput.packageData.name).toBe('dep');
    });

    test('a local artifact is recorded under the registry it was published to', async () => {
        const ctx = context();
        const realRegistry = { getRegistryType: () => 'PRIVATE', endpoint: 'https://private.example' };
        ctx.rawInput.packageData.registry.getRegistryType = () => RegistryType.LOCAL;
        ctx.rawInput.packageData.registry.getRealPackage = jest.fn(async () => ({ packageName: 'dep', registry: realRegistry }));
        ctx.rawInput.packageData.integrity = undefined;
        await expect(init.run(ctx)).rejects.toThrow('past integrity check');
        expect(ctx.runtime.installRegistry).toBe(realRegistry);
    });
});

describe('install release pinned by the lockfile root', () => {
    function lockfile(root: any = {}) {
        return Lockfile.fromJson({ lockfileVersion: 1, source: 'TST', name: 'root', version: '1.2.0', registry: 'public', integrity: 'root-sha', packages: [], ...root });
    }

    function context(version?: string, lock = lockfile(), released: any = {}) {
        return {
            rawInput: {
                packageData: {
                    name: 'root',
                    version,
                    registry: {
                        name: 'test',
                        endpoint: 'public',
                        getRegistryType: () => 'PUBLIC',
                        getPackage: jest.fn(async (_name: string, requested: string) => ({
                            name: 'root',
                            checksum: 'root-sha',
                            manifest: { name: 'root', version: requested === 'latest' ? '2.0.0' : requested, ...released },
                            transports: []
                        }))
                    }
                },
                contextData: { systemPackages: [] },
                installData: { checks: { lockfile: lock }, installDevclass: { transportLayer: 'ZLAYER' } }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'error', 'info', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        //reaching the next system call means the lockfile checks passed
        (SystemConnector.isTransportLayerExist as jest.Mock).mockRejectedValue(new Error('past lockfile check'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('without a version the root version and integrity of the lockfile are installed', async () => {
        const ctx = context();
        await expect(init.run(ctx)).rejects.toThrow('past lockfile check');
        expect(ctx.rawInput.packageData.registry.getPackage).toHaveBeenCalledWith('root', '1.2.0');
        expect(ctx.rawInput.packageData.integrity).toBe('root-sha');
    });

    test('the same explicit version is accepted', async () => {
        await expect(init.run(context('1.2.0'))).rejects.toThrow('past lockfile check');
    });

    test('a conflicting explicit version aborts before fetching the release', async () => {
        const ctx = context('1.3.0');
        await expect(init.run(ctx)).rejects.toThrow('Requested version 1.3.0 conflicts with lockfile version 1.2.0 of "root"');
        expect(ctx.rawInput.packageData.registry.getPackage).not.toHaveBeenCalled();
    });

    test('a distribution tag resolving to another release aborts', async () => {
        await expect(init.run(context('latest'))).rejects.toThrow('Release "root" v2.0.0 (latest) conflicts with lockfile version 1.2.0');
        expect(SystemConnector.isTransportLayerExist).not.toHaveBeenCalled();
    });

    test('a lockfile of another package aborts before fetching the release', async () => {
        const ctx = context(undefined, lockfile({ name: 'other' }));
        await expect(init.run(ctx)).rejects.toThrow('Lockfile is for package "other", cannot install "root" with it.');
        expect(ctx.rawInput.packageData.registry.getPackage).not.toHaveBeenCalled();
    });

    test('the package name is compared case-insensitively', async () => {
        await expect(init.run(context(undefined, lockfile({ name: 'ROOT' })))).rejects.toThrow('past lockfile check');
    });

    test('a local artifact of another package aborts', async () => {
        const ctx = context(undefined, lockfile(), { name: 'other' });
        ctx.rawInput.packageData.name = './other.trm';
        ctx.rawInput.packageData.registry.getRegistryType = () => RegistryType.LOCAL;
        await expect(init.run(ctx)).rejects.toThrow('Lockfile is for package "root", cannot install "other" with it.');
    });

    test('a local artifact of another release aborts', async () => {
        const ctx = context(undefined, lockfile(), { version: '1.1.0' });
        ctx.rawInput.packageData.name = './root.trm';
        ctx.rawInput.packageData.registry.getRegistryType = () => RegistryType.LOCAL;
        ctx.rawInput.packageData.registry.getRealPackage = jest.fn(async () => ({ packageName: 'root', registry: { getRegistryType: () => 'PUBLIC', endpoint: 'public' } }));
        await expect(init.run(ctx)).rejects.toThrow('Release "root" v1.1.0 (1.2.0) conflicts with lockfile version 1.2.0');
    });

    test('a release of another registry aborts', async () => {
        const ctx = context();
        ctx.rawInput.packageData.registry.endpoint = 'https://private.example';
        await expect(init.run(ctx)).rejects.toThrow('Lockfile is for package "root" of registry "public", cannot install it from registry "https://private.example".');
    });

    test('a conflicting explicit integrity aborts before fetching the release', async () => {
        const ctx = context();
        ctx.rawInput.packageData.integrity = 'other-sha';
        await expect(init.run(ctx)).rejects.toThrow('Requested integrity conflicts with lockfile integrity of "root" v1.2.0.');
        expect(ctx.rawInput.packageData.registry.getPackage).not.toHaveBeenCalled();
    });

    test('a release not matching the lockfile root integrity aborts', async () => {
        await expect(init.run(context(undefined, lockfile({ integrity: 'locked-sha' })))).rejects.toThrow('Cannot continue due to security issues.');
    });

    test('a lockfile without root integrity pins the version only', async () => {
        const ctx = context(undefined, lockfile({ integrity: undefined }));
        await expect(init.run(ctx)).rejects.toThrow('past lockfile check');
        expect(ctx.rawInput.packageData.integrity).toBeUndefined();
    });

    test('a lockfile without root keeps the requested version', async () => {
        const ctx = context(undefined, Lockfile.fromJson({ lockfileVersion: 1, source: 'TST', packages: [] }));
        await expect(init.run(ctx)).rejects.toThrow('past lockfile check');
        expect(ctx.rawInput.packageData.registry.getPackage).toHaveBeenCalledWith('root', 'latest');
    });

    test('a dependency install does not apply the lockfile root', async () => {
        const ctx = context('1.0.0', lockfile({ name: 'other' }));
        ctx.rawInput.dependency = true;
        await expect(init.run(ctx)).rejects.toThrow('past lockfile check');
        expect(ctx.rawInput.packageData.integrity).toBeUndefined();
    });
});
