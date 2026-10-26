jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'DEV'),
        setPackageTransportLayer: jest.fn(),
        setPackageSuperpackage: jest.fn(),
        clearPackageSuperpackage: jest.fn()
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

    test('a real error is thrown after every restore is attempted', async () => {
        (SystemConnector.setPackageTransportLayer as jest.Mock).mockRejectedValueOnce(new Error('locked'));
        (SystemConnector.clearPackageSuperpackage as jest.Mock).mockRejectedValueOnce(dialog());

        await expect(cleanupCheckpoint.revert(context())).rejects.toThrow('locked');

        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledTimes(2);
        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZONE', 'ZPARENT');
        expect(Logger.warning).toHaveBeenCalledWith('Remove the superpackage of SAP package ZTWO in SE21: the SAP package API is unsupported on DEV.', { important: true });
    });
});
