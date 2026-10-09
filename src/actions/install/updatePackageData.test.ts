jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        setInstallDevc: jest.fn(),
        deleteInstallDevc: jest.fn(),
        restoreInstallMetadata: jest.fn(),
        setInstallTransports: jest.fn(),
        updateTrmPackageData: jest.fn(),
        getTrmPackageData: jest.fn()
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
            installRegistry: { getRegistryType: () => RegistryType.PUBLIC },
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
        jest.spyOn(SystemConnector, 'deleteInstallDevc').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'restoreInstallMetadata').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'setInstallTransports').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'getTrmPackageData').mockResolvedValue(undefined);
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

    test('an upgrade that kept the installed customizing still records its transports', async () => {
        const ctx = context();
        ctx.runtime.update = { packageName: 'pkg' };
        ctx.runtime.skippedCust = ['DEVK900004'];
        ctx.runtime.previousInstallTransports = [
            { trkorr: 'DEVK9OLDC', trmType: 'CUST' },
            { trkorr: 'DEVK9OLDL', trmType: 'LANG' }
        ];

        await updatePackageData.run(ctx);

        expect(SystemConnector.setInstallTransports).toHaveBeenCalledWith('pkg', 'public', [
            { package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK9OLDC', trm_type: 'CUST' },
            { package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK900003', trm_type: 'CUST' },
            { package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK900002', trm_type: 'LANG' }
        ]);
    });

    test('an upgrade that imported all the new customizing records only the new transports', async () => {
        const ctx = context();
        ctx.runtime.update = { packageName: 'pkg' };
        ctx.runtime.skippedCust = [];
        ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9OLDC', trmType: 'CUST' }];

        await updatePackageData.run(ctx);

        expect((SystemConnector.setInstallTransports as jest.Mock).mock.calls[0][2].map((o: any) => o.trkorr)).toEqual(['DEVK900003', 'DEVK900002']);
    });

    const storedRow = {
        package_name: 'pkg', package_registry: 'public', manifest: Buffer.from('<old/>'),
        trkorr: 'DEVK900000', integrity: 'old-sha', devclass: 'ZROOT'
    };

    test('upgrade reads the stored row before writing anything', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        jest.spyOn(SystemConnector, 'getTrmPackageData').mockResolvedValue(storedRow);

        await updatePackageData.run(ctx);

        expect(SystemConnector.getTrmPackageData).toHaveBeenCalledWith('pkg', 'public');
        expect((SystemConnector.getTrmPackageData as jest.Mock).mock.invocationCallOrder[0])
            .toBeLessThan((SystemConnector.setInstallDevc as jest.Mock).mock.invocationCallOrder[0]);
        expect(ctx.revert.metadataPreviousPackageRow).toBe(storedRow);
    });

    test('a failed read of the stored row aborts before any write and the revert changes nothing', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [{ originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }];
        jest.spyOn(SystemConnector, 'getTrmPackageData').mockRejectedValue(new Error('read failed'));

        await expect(execute('metadata-read-test', [updatePackageData], ctx)).rejects.toThrow('read failed');

        expect(SystemConnector.setInstallDevc).not.toHaveBeenCalled();
        expect(SystemConnector.updateTrmPackageData).not.toHaveBeenCalled();
        expect(SystemConnector.restoreInstallMetadata).not.toHaveBeenCalled();
    });

    test('first installs do not read the stored row', async () => {
        await updatePackageData.run(context());

        expect(SystemConnector.getTrmPackageData).not.toHaveBeenCalled();
    });

    test('upgrade rollback restores the previous install transports with the package row', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        jest.spyOn(SystemConnector, 'getTrmPackageData').mockResolvedValue(storedRow);
        ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9OLDC', trmType: 'CUST' }];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));

        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith(expect.objectContaining({
            package: storedRow,
            packageExists: true,
            installTr: [{ package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK9OLDC', trm_type: 'CUST' }]
        }));
    });

    test('upgrade rollback without a stored row deletes the written row and restores mappings and transports atomically', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [{ originalDevclass: 'ZOLD', installDevclass: 'ZOLD_TARGET' }];
        ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9OLDC', trmType: 'CUST' }];
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: 'ZOLD', installDevclass: 'ZNEW_TARGET' }];
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));

        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith({
            package: ctx.revert.metadataPackageRow,
            packageExists: false,
            installDevc: [{ package_name: 'pkg', package_registry: 'public', original_devclass: 'ZOLD', install_devclass: 'ZOLD_TARGET' }],
            installTr: [{ package_name: 'pkg', package_registry: 'public', trkorr: 'DEVK9OLDC', trm_type: 'CUST' }]
        });
        // The previous state is restored through the atomic operation only.
        expect(SystemConnector.setInstallDevc).toHaveBeenCalledTimes(1);
        expect(SystemConnector.setInstallTransports).toHaveBeenCalledTimes(1);
    });

    test('a transports write failure is reverted even without previous mappings', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        const failure = new Error('transports response lost');
        (SystemConnector.setInstallTransports as jest.Mock).mockRejectedValueOnce(failure);

        await expect(updatePackageData.run(ctx)).rejects.toBe(failure);
        expect(SystemConnector.updateTrmPackageData).not.toHaveBeenCalled();
        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith(expect.objectContaining({
            packageExists: false,
            installDevc: [],
            installTr: []
        }));
    });

    test('a failed atomic restore is surfaced', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(new Error('row failed'));
        await expect(updatePackageData.run(ctx)).rejects.toThrow('row failed');
        jest.spyOn(SystemConnector, 'restoreInstallMetadata').mockRejectedValue(new Error('restore failed'));

        await expect(updatePackageData.revert(ctx)).rejects.toThrow('restore failed');
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

    test('upgrade rollback atomically restores the previous package row and mappings', async () => {
        const ctx = context();
        ctx.runtime.update = {};
        jest.spyOn(SystemConnector, 'getTrmPackageData').mockResolvedValue(storedRow);
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
            package: storedRow,
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
        ctx.runtime.update = {};
        ctx.runtime.previousInstallPackages = [];
        ctx.revert.metadataWriteStarted = true;
        ctx.revert.metadataPreviousPackageRead = true;
        ctx.revert.metadataPreviousPackageRow = storedRow;

        await updatePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith({
            package: storedRow,
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
        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledTimes(1);
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
        (SystemConnector.setInstallDevc as jest.Mock).mockRejectedValueOnce(new Error('mapping response lost'));

        await expect(execute('metadata-first-write-test', [updatePackageData], ctx))
            .rejects.toThrow('mapping response lost');
        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith(expect.objectContaining({
            packageExists: false,
            installDevc: [expect.objectContaining({ original_devclass: 'ZOLD', install_devclass: 'ZOLD_TARGET' })]
        }));
        expect(SystemConnector.updateTrmPackageData).not.toHaveBeenCalled();
    });

    test('local-registry rollback reuses the resolved registry marker from forward write', async () => {
        const ctx = context();
        ctx.rawInput.packageData.registry = { getRegistryType: () => RegistryType.LOCAL, endpoint: '/tmp/local-registry' };
        //resolved by init from the local artifact
        ctx.runtime.installRegistry = { getRegistryType: () => RegistryType.PRIVATE, endpoint: 'https://registry.example' };
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

        expect(SystemConnector.getTrmPackageData).toHaveBeenCalledWith('pkg', 'https://registry.example');
        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith(expect.objectContaining({
            installDevc: [expect.objectContaining({ package_registry: 'https://registry.example' })]
        }));
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

    describe('stored mappings of removed devclasses', () => {
        const row = (original: string, install: string) => ({
            package_name: 'pkg', package_registry: 'public', original_devclass: original, install_devclass: install
        });

        function upgrade() {
            const ctx = context();
            ctx.runtime.update = {};
            ctx.rawInput.installData.installDevclass.keepOriginal = false;
            ctx.rawInput.installData.installDevclass.replacements = [
                { originalDevclass: 'ZROOT', installDevclass: 'ZROOT_NEW' },
                { originalDevclass: 'ZADDED', installDevclass: 'ZADDED_T' }
            ];
            ctx.runtime.previousInstallPackages = [
                { originalDevclass: 'ZROOT', installDevclass: 'ZROOT_T' },
                { originalDevclass: 'ZREMOVED', installDevclass: 'ZREMOVED_T' }
            ];
            return ctx;
        }

        test('deletes them after writing the new mappings', async () => {
            await updatePackageData.run(upgrade());

            expect(SystemConnector.deleteInstallDevc).toHaveBeenCalledWith([row('ZREMOVED', 'ZREMOVED_T')]);
            expect((SystemConnector.deleteInstallDevc as jest.Mock).mock.invocationCallOrder[0])
                .toBeGreaterThan((SystemConnector.setInstallDevc as jest.Mock).mock.invocationCallOrder[0]);
        });

        test('nothing is deleted when every stored mapping is rewritten', async () => {
            const ctx = upgrade();
            ctx.runtime.previousInstallPackages = [{ originalDevclass: 'ZROOT', installDevclass: 'ZROOT_T' }];
            await updatePackageData.run(ctx);

            expect(SystemConnector.deleteInstallDevc).not.toHaveBeenCalled();
        });

        test('keep-original upgrades delete mappings of the previously renamed install', async () => {
            const ctx = upgrade();
            ctx.rawInput.installData.installDevclass.keepOriginal = true;
            ctx.rawInput.installData.installDevclass.replacements = [];
            await updatePackageData.run(ctx);

            expect(SystemConnector.deleteInstallDevc).toHaveBeenCalledWith([row('ZROOT', 'ZROOT_T'), row('ZREMOVED', 'ZREMOVED_T')]);
        });

        test.each([
            ['with', storedRow],
            ['without', undefined]
        ])('a failed deletion is rolled back %s a stored row: every previous mapping replaces the written ones', async (_, previousRow) => {
            const ctx = upgrade();
            jest.spyOn(SystemConnector, 'getTrmPackageData').mockResolvedValue(previousRow);
            const failure = new Error('delete response lost');
            (SystemConnector.deleteInstallDevc as jest.Mock).mockRejectedValueOnce(failure);

            await expect(updatePackageData.run(ctx)).rejects.toBe(failure);
            expect(SystemConnector.setInstallTransports).not.toHaveBeenCalled();
            await updatePackageData.revert(ctx);

            expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith(expect.objectContaining({
                packageExists: !!previousRow,
                installDevc: [row('ZROOT', 'ZROOT_T'), row('ZREMOVED', 'ZREMOVED_T')]
            }));
            expect(SystemConnector.deleteInstallDevc).toHaveBeenCalledTimes(1);
            expect(SystemConnector.setInstallDevc).toHaveBeenCalledTimes(1);
        });
    });
});
