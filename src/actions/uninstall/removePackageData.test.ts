jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        restoreInstallMetadata: jest.fn(),
        getDest: jest.fn(() => 'TST')
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { removePackageData } from './removePackageData';

const row = {
    package_name: 'pkg',
    package_registry: 'public',
    manifest: Buffer.from('<xml/>'),
    trkorr: 'DEVK9INST',
    integrity: 'sha',
    devclass: 'ZPKG'
};

function context(snapshot: any = row) {
    return {
        runtime: {
            update: { packageName: 'pkg', getMetadataSnapshot: () => snapshot },
            previousInstallPackages: [{ originalDevclass: 'ZORIG', installDevclass: 'ZPKG' }],
            previousInstallTransports: [{ trkorr: 'DEVK9CUST1', trmType: 'CUST' }]
        },
        revert: { sapPackages: [], metadataRemoveStarted: false }
    } as any;
}

describe('removePackageData', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'success').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        (SystemConnector.restoreInstallMetadata as jest.Mock).mockResolvedValue(undefined);
    });

    test('fails instead of skipping when the package has no TRM packages table row', async () => {
        const ctx = context(null);

        await expect(removePackageData.run(ctx)).rejects.toThrow('TRM packages table record of pkg is missing');
        expect(SystemConnector.restoreInstallMetadata).not.toHaveBeenCalled();

        // Nothing was removed: revert must not recreate a row.
        await removePackageData.revert(ctx);
        expect(SystemConnector.restoreInstallMetadata).not.toHaveBeenCalled();
    });

    test('removes the package row, its install mappings and install transports atomically', async () => {
        await removePackageData.run(context());

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledWith({
            package: row,
            packageExists: false,
            installDevc: [],
            installTr: []
        });
    });

    test('revert restores the exact row, install mappings and install transports', async () => {
        const ctx = context();
        await removePackageData.run(ctx);

        await removePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenLastCalledWith({
            package: row,
            packageExists: true,
            installDevc: [{
                package_name: 'pkg',
                package_registry: 'public',
                original_devclass: 'ZORIG',
                install_devclass: 'ZPKG'
            }],
            installTr: [{
                package_name: 'pkg',
                package_registry: 'public',
                trkorr: 'DEVK9CUST1',
                trm_type: 'CUST'
            }]
        });
    });

    test('a failed removal response is still restored on revert', async () => {
        const ctx = context();
        (SystemConnector.restoreInstallMetadata as jest.Mock).mockRejectedValueOnce(new Error('response lost'));

        await expect(removePackageData.run(ctx)).rejects.toThrow('response lost');
        await removePackageData.revert(ctx);

        expect(SystemConnector.restoreInstallMetadata).toHaveBeenCalledTimes(2);
        expect((SystemConnector.restoreInstallMetadata as jest.Mock).mock.calls[1][0].packageExists).toBe(true);
    });

    test('revert does nothing when the removal never started', async () => {
        await removePackageData.revert(context());

        expect(SystemConnector.restoreInstallMetadata).not.toHaveBeenCalled();
    });
});
