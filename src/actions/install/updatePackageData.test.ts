jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        setInstallDevc: jest.fn(),
        restoreInstallMetadata: jest.fn(),
        setInstallTransports: jest.fn(),
        updateTrmPackageData: jest.fn()
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { SystemConnector } from '../../systemConnector';
import { RegistryType } from '../../registry';
import { updatePackageData } from './updatePackageData';

function context() {
    return {
        rawInput: {
            packageData: { name: 'pkg', registry: { getRegistryType: () => 1 } },
            installData: {
                installDevclass: {
                    keepOriginal: true,
                    replacements: []
                }
            }
        },
        runtime: {
            package: {
                data: { manifest: { name: 'pkg', version: '1.0.0' }, checksum: 'sha' },
                hierarchy: { devclass: 'ZROOT' }
            },
            transports: {
                tadir: { instance: { trkorr: 'DEVK900001' } },
                lang: { instance: { trkorr: 'DEVK900002' } },
                // A customizing transport skipped by the import has no instance.
                cust: [{ instance: { trkorr: 'DEVK900003' } }, {}]
            },
            previousInstallPackages: [],
            previousInstallTransports: []
        },
        output: {},
        revert: {}
    } as any;
}

describe('install package metadata writes', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.spyOn(SystemConnector, 'setInstallDevc').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'restoreInstallMetadata').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'setInstallTransports').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockResolvedValue(undefined);
    });

    test('records the customizing and translation transports imported on this system', async () => {
        await updatePackageData.run(context());

        expect(SystemConnector.setInstallTransports).toHaveBeenCalledWith('pkg', 'public', [
            { package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK900003', trm_type: 'CUST' },
            { package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK900002', trm_type: 'LANG' }
        ]);
        const transportsOrder = (SystemConnector.setInstallTransports as jest.Mock).mock.invocationCallOrder[0];
        expect(transportsOrder).toBeGreaterThan((SystemConnector.setInstallDevc as jest.Mock).mock.invocationCallOrder[0]);
        expect(transportsOrder).toBeLessThan((SystemConnector.updateTrmPackageData as jest.Mock).mock.invocationCallOrder[0]);
    });

    test('upgrade rollback restores the previous install transports with the package row', async () => {
        const ctx = context();
        const previousRow = {
            package_name: 'pkg', package_registry: 'public', manifest: Buffer.from('<old/>'),
            trkorr: 'DEVK900000', integrity: 'old-sha', devclass: 'ZROOT'
        };
        ctx.runtime.update = { getMetadataSnapshot: () => previousRow };
        ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9OLDC', trmType: 'CUST' }];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));

        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith(expect.objectContaining({
            package: previousRow,
            packageExists: true,
            installTr: [{ package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK9OLDC', trm_type: 'CUST' }]
        }));
    });

    test('rollback without a previous row restores transports even when mappings fail', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [{ originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }];
        ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9OLDC', trmType: 'CUST' }];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));
        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        (SystemConnector.setInstallDevc as jest.Mock).mockRejectedValueOnce(new Error('mapping restore failed'));

        await expect(updatePackageData.revert(ctx)).rejects.toThrow('mapping restore failed');

        expect(SystemConnector.setInstallTransports).toHaveBeenLastCalledWith('pkg', 'public', [
            { package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK9OLDC', trm_type: 'CUST' }
        ]);
    });

    test('a transports write failure is reverted even without previous mappings', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        const failure = new Error('transports response lost');
        (SystemConnector.setInstallTransports as jest.Mock).mockRejectedValueOnce(failure);

        await expect(updatePackageData.run(ctx)).rejects.toBe(failure);
        expect(SystemConnector.updateTrmPackageData).not.toHaveBeenCalled();
        await updatePackageData.revert(ctx);

        expect(SystemConnector.setInstallTransports).toHaveBeenLastCalledWith('pkg', 'public', []);
    });

    test('propagates mapping-write failure before package-row write', async () => {
        const failure = new Error('mapping write failed');
        jest.spyOn(SystemConnector, 'setInstallDevc').mockRejectedValue(failure);

        await expect(updatePackageData.run(context())).rejects.toBe(failure);
        expect(SystemConnector.updateTrmPackageData).not.toHaveBeenCalled();
    });

    test('propagates package-row failure after mapping write', async () => {
        const failure = new Error('package row write failed');
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(failure);

        await expect(updatePackageData.run(context())).rejects.toBe(failure);
        expect(SystemConnector.setInstallDevc).toHaveBeenCalledTimes(1);
        expect(SystemConnector.updateTrmPackageData).toHaveBeenCalledTimes(1);
    });

    test('upgrade rollback restores prior install mappings after metadata write failure', async () => {
        const ctx = context();
        const failure = new Error('package row write failed');
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }
        ];
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZNEW_TARGET' }
        ];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(failure);

        await expect(updatePackageData.run(ctx)).rejects.toBe(failure);
        expect(ctx.revert.metadataWriteStarted).toBe(true);

        await updatePackageData.revert(ctx);
        expect(SystemConnector.setInstallDevc).toHaveBeenLastCalledWith([
            {
                package_name: 'pkg',
                package_registry: 'public',
                original_devclass: 'ZOLD',
                install_devclass: 'ZOLD_TARGET'
            }
        ]);
    });

    test('upgrade rollback atomically restores the previous package row and mappings', async () => {
        const ctx = context();
        ctx.runtime.update = {
            getMetadataSnapshot: () => ({
                package_name: 'pkg',
                package_registry: 'public',
                manifest: Buffer.from('<old-manifest/>'),
                trkorr: 'DEVK900000',
                integrity: 'old-sha',
                devclass: 'ZROOT'
            })
        };
        ctx.runtime.previousInstallPackages = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }
        ];
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZNEW_TARGET' }
        ];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));

        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith({
            package: ctx.revert.metadataPreviousPackageRow,
            packageExists: true,
            installDevc: [{
                package_name: 'pkg',
                package_registry: 'public',
                original_devclass: 'ZOLD',
                install_devclass: 'ZOLD_TARGET'
            }],
            installTr: []
        });
        expect(SystemConnector.setInstallDevc).toHaveBeenCalledTimes(1);
    });

    test('upgrade rollback restores a previous package row even without install mappings', async () => {
        const ctx = context();
        const previousRow = {
            package_name: 'pkg', package_registry: 'public', manifest: Buffer.from('<old/>'),
            trkorr: 'DEVK900000', integrity: 'old-sha', devclass: 'ZROOT'
        };
        ctx.runtime.update = { getMetadataSnapshot: () => previousRow };
        ctx.runtime.previousInstallPackages = [];
        ctx.revert.metadataWriteStarted = true;
        ctx.revert.metadataPreviousPackageRow = previousRow;

        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith({
            package: previousRow,
            packageExists: true,
            installDevc: [],
            installTr: []
        });
    });

    test('workflow execution invokes metadata revert when the package row write fails', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }
        ];
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZNEW_TARGET' }
        ];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));

        await expect(execute('metadata-test', [updatePackageData], ctx)).rejects.toThrow('row failed');
        expect(SystemConnector.setInstallDevc).toHaveBeenCalledTimes(2);
    });

    test('workflow execution restores mappings when the first metadata write throws', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }
        ];
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZNEW_TARGET' }
        ];
        (SystemConnector.setInstallDevc as jest.Mock)
            .mockRejectedValueOnce(new Error('mapping response lost'))
            .mockResolvedValueOnce(undefined);

        await expect(execute('metadata-first-write-test', [updatePackageData], ctx))
            .rejects.toThrow('mapping response lost');
        expect(SystemConnector.setInstallDevc).toHaveBeenCalledTimes(2);
        expect(SystemConnector.updateTrmPackageData).not.toHaveBeenCalled();
    });

    test('local-registry rollback reuses the resolved registry marker from forward write', async () => {
        const ctx = context();
        const registry = {
            getRegistryType: () => RegistryType.LOCAL,
            getRealRegistry: jest.fn().mockResolvedValue({
                getRegistryType: () => RegistryType.PRIVATE,
                endpoint: 'https://registry.example'
            }),
            endpoint: '/tmp/local-registry'
        };
        ctx.rawInput.packageData.registry = registry;
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }
        ];
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZOLD', installDevclass: 'ZNEW_TARGET' }
        ];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));

        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        await updatePackageData.revert(ctx);

        expect(SystemConnector.setInstallDevc).toHaveBeenLastCalledWith([
            expect.objectContaining({ package_registry: 'https://registry.example' })
        ]);
    });

    test('first-install metadata revert does not fabricate a deletion call', async () => {
        const ctx = context();
        ctx.revert.metadataWriteStarted = true;
        ctx.runtime.previousInstallPackages = [];

        await updatePackageData.revert(ctx);

        expect(SystemConnector.setInstallDevc).not.toHaveBeenCalled();
    });

    test('first-install rollback uses atomic SAP metadata deletion', async () => {
        const ctx = context();
        ctx.revert.metadataWriteStarted = true;
        ctx.revert.metadataPackageRow = {
            package_name: 'pkg',
            package_registry: 'public',
            manifest: Buffer.from('<manifest/>'),
            trkorr: 'DEVK900001',
            integrity: 'sha',
            devclass: 'ZROOT'
        };

        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith({
            package: ctx.revert.metadataPackageRow,
            packageExists: false,
            installDevc: [],
            installTr: []
        });
    });
});
