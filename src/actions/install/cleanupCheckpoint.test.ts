jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'DEV'),
        setPackageTransportLayer: jest.fn(),
        setPackageSuperpackage: jest.fn(),
        clearPackageSuperpackage: jest.fn(),
        // packages not found: every restore is written
        getDevclass: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('./importBatch', () => ({
    deleteImportedEntries: jest.fn()
}));

import { Logger } from 'trm-commons';
import { ClientError } from '../../client';
import { SystemConnector } from '../../systemConnector';
import { cleanupCheckpoint } from './cleanupCheckpoint';

const dialog = () => new ClientError('DYNPRO_SEND_IN_BACKGROUND', { class: '', no: '000' }, '', '/ATRM/TDEVC_INTERFACE');

function context() {
    return {
        revert: {
            sapPackages: [],
            importedEntries: [],
            packageTransportLayers: [{ devclass: 'ZONE', transportLayer: 'ZOLD' }, { devclass: 'ZTWO', transportLayer: '' }],
            packageHierarchy: [{ devclass: 'ZONE', parentcl: 'ZPARENT' }, { devclass: 'ZTWO', parentcl: '' }]
        }
    } as any;
}

describe('cleanup-checkpoint revert', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
        for (const method of ['log', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a restore the SAP package API cannot run is a warning with what to restore by hand; the others are attempted', async () => {
        (SystemConnector.setPackageTransportLayer as jest.Mock).mockRejectedValueOnce(dialog());
        (SystemConnector.setPackageSuperpackage as jest.Mock).mockRejectedValueOnce(dialog());

        await expect(cleanupCheckpoint.revert(context())).resolves.toBeUndefined();

        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZTWO', '');
        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZTWO');
        expect(Logger.warning).toHaveBeenCalledWith('Set transport layer ZOLD on SAP package ZONE in SE21: the SAP package API is unsupported on DEV.', { important: true });
        expect(Logger.warning).toHaveBeenCalledWith('Set the superpackage of SAP package ZONE back to ZPARENT in SE21: the SAP package API is unsupported on DEV.', { important: true });
    });

    test('a superpackage that is already the original one is not written: no package API call, no warning', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            ({ devclass, parentcl: devclass === 'ZONE' ? 'ZPARENT' : '' }));
        (SystemConnector.clearPackageSuperpackage as jest.Mock).mockRejectedValue(dialog());

        await expect(cleanupCheckpoint.revert(context())).resolves.toBeUndefined();

        expect(SystemConnector.setPackageSuperpackage).not.toHaveBeenCalled();
        expect(SystemConnector.clearPackageSuperpackage).not.toHaveBeenCalled();
        expect(Logger.warning).not.toHaveBeenCalledWith(expect.stringContaining('superpackage'), expect.anything());
    });

    test('only a changed superpackage is restored', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            ({ devclass, parentcl: devclass === 'ZONE' ? 'ZPARENT' : 'ZINSTALLED' }));

        await expect(cleanupCheckpoint.revert(context())).resolves.toBeUndefined();

        expect(SystemConnector.setPackageSuperpackage).not.toHaveBeenCalled();
        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZTWO');
    });

    test('a superpackage that cannot be read is restored anyway, and the next restores still run', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockRejectedValue(new Error('read failed'));
        (SystemConnector.setPackageSuperpackage as jest.Mock).mockRejectedValueOnce(new Error('locked'));

        await expect(cleanupCheckpoint.revert(context())).rejects.toThrow('locked');

        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZONE', 'ZPARENT');
        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZTWO');
    });

    test('a real error is thrown after every restore is attempted', async () => {
        (SystemConnector.setPackageTransportLayer as jest.Mock).mockRejectedValueOnce(new Error('locked'));
        (SystemConnector.clearPackageSuperpackage as jest.Mock).mockRejectedValueOnce(dialog());

        await expect(cleanupCheckpoint.revert(context())).rejects.toThrow('locked');

        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledTimes(2);
        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZONE', 'ZPARENT');
        expect(Logger.warning).toHaveBeenCalledWith('Remove the superpackage of SAP package ZTWO in SE21: the SAP package API is unsupported on DEV.', { important: true });
    });
});
