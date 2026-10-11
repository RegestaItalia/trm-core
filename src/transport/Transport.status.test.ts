jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        readTable: jest.fn(),
        deleteTrkorr: jest.fn(),
        releaseTrkorr: jest.fn()
    }
}));

import { SystemConnector } from '../systemConnector';
import { Transport } from './Transport';

const TRKORR = 'TSTK900001';

function mockStatus(...statuses: (string | null)[]) {
    const readTable = SystemConnector.readTable as jest.Mock;
    for (const status of statuses) {
        readTable.mockResolvedValueOnce(status === null ? [] : [{ trkorr: TRKORR, trstatus: status }]);
    }
}

describe('Transport status cache', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    test('canBeDeleted and isReleased return false when no E070 row exists', async () => {
        mockStatus(null, null);
        const transport = new Transport(TRKORR);

        await expect(transport.canBeDeleted()).resolves.toBe(false);
        await expect(transport.isReleased()).resolves.toBe(false);
    });

    test('delete invalidates the cached status so a second rollback does not delete again', async () => {
        mockStatus('D', null);
        const transport = new Transport(TRKORR);

        //release-transport revert
        if (await transport.canBeDeleted()) {
            await transport.delete();
        }
        //generator revert on the same instance
        if (await transport.canBeDeleted()) {
            await transport.delete();
        }

        expect(SystemConnector.deleteTrkorr).toHaveBeenCalledTimes(1);
        expect(SystemConnector.readTable).toHaveBeenCalledTimes(2);
    });

    test('a failed delete still invalidates the cached status', async () => {
        mockStatus('D', null);
        (SystemConnector.deleteTrkorr as jest.Mock).mockRejectedValueOnce(new Error('delete failed'));
        const transport = new Transport(TRKORR);

        await expect(transport.canBeDeleted()).resolves.toBe(true);
        await expect(transport.delete()).rejects.toThrow('delete failed');
        await expect(transport.canBeDeleted()).resolves.toBe(false);
    });

    test('release invalidates the cached status', async () => {
        mockStatus('D', 'R');
        const transport = new Transport(TRKORR);
        jest.spyOn(transport as any, '_isInTmsQueue').mockResolvedValue(undefined);

        await expect(transport.canBeDeleted()).resolves.toBe(true);
        await transport.release(false, true);
        await expect(transport.canBeDeleted()).resolves.toBe(false);
        await expect(transport.isReleased()).resolves.toBe(true);
    });

    test('a failed release still invalidates the cached status', async () => {
        mockStatus('D', 'R');
        (SystemConnector.releaseTrkorr as jest.Mock).mockRejectedValueOnce(new Error('release failed'));
        const transport = new Transport(TRKORR);

        await expect(transport.canBeDeleted()).resolves.toBe(true);
        await expect(transport.release(false, true)).rejects.toThrow('release failed');
        await expect(transport.isReleased()).resolves.toBe(true);
    });

    test('getE071K reads the E071K columns, including the owning master object', async () => {
        (SystemConnector.readTable as jest.Mock).mockResolvedValueOnce([]);

        await new Transport(TRKORR).getE071K();

        expect(SystemConnector.readTable).toHaveBeenCalledWith('E071K', [
            { fieldName: 'PGMID' },
            { fieldName: 'OBJECT' },
            { fieldName: 'OBJNAME' },
            { fieldName: 'MASTERTYPE' },
            { fieldName: 'MASTERNAME' }
        ], `TRKORR EQ '${TRKORR}'`);
    });
});
