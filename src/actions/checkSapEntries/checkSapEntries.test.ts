jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        checkSapEntryExists: jest.fn(),
        readTable: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { checkSapEntries } from '.';

const connector = SystemConnector as unknown as {
    checkSapEntryExists: jest.Mock,
    readTable: jest.Mock
};

function run(sapEntries: any) {
    return checkSapEntries({ packageData: { manifest: { name: 'test', version: '1.0.0', sapEntries } } });
}

describe('checkSapEntries', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['info', 'log', 'table', 'error', 'loading', 'success'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        // entries are checked one by one unless a test reads them in batches
        connector.readTable.mockRejectedValue(new Error('no batch read'));
    });

    test('statuses are emitted in declaration order', async () => {
        connector.checkSapEntryExists.mockImplementation(async (table: string, entry: any) => table === 'TADIR' || entry.ID !== 'B');
        const output = await run({ ZTAB: [{ ID: 'A' }, { ID: 'B' }, { ID: 'C' }] });
        expect(output.sapEntriesStatus.ZTAB).toEqual([
            { status: true, entry: { ID: 'A' } },
            { status: false, entry: { ID: 'B' } },
            { status: true, entry: { ID: 'C' } }
        ]);
        expect((Logger.loading as jest.Mock).mock.calls.map(([message]) => message)).toEqual([
            'Checking 3 SAP entries: 0% (ZTAB)...',
            'Checking 3 SAP entries: 33% (ZTAB)...',
            'Checking 3 SAP entries: 66% (ZTAB)...',
            'Checking 3 SAP entries: 100% (ZTAB)...'
        ]);
    });

    test('entries with the same fields are read in batches', async () => {
        // the table probe (lowercase fields) finds TADIR; single entry checks find what the batches find
        connector.checkSapEntryExists.mockImplementation(async (_table: string, entry: any) => !!entry.obj_name || ['CX_ROOT', 'TADIR'].includes(entry.OBJ_NAME));
        connector.readTable.mockReset().mockImplementation(async (_table: string, _fields: any[], where: string) =>
            ['CX_ROOT', 'TADIR'].filter(name => where.includes(`'${name}'`)).map(objName => ({ pgmid: 'R3TR', object: 'TABL', objName })));
        const entries = Array.from({ length: 30 }, (_, i) => ({ PGMID: 'R3TR', OBJECT: 'TABL', OBJ_NAME: i === 0 ? 'CX_ROOT' : i === 29 ? 'TADIR' : `ZMISSING${i}` }));

        const output = await run({ TADIR: entries });

        expect(connector.readTable).toHaveBeenCalledTimes(2);
        expect(connector.readTable.mock.calls[0]).toEqual(['TADIR', [{ fieldName: 'OBJECT' }, { fieldName: 'OBJ_NAME' }, { fieldName: 'PGMID' }],
            expect.stringMatching(/^\( PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ 'CX_ROOT' \) OR \( /)]);
        expect(output.sapEntriesStatus.TADIR.filter(o => o.status).map(o => o.entry.OBJ_NAME)).toEqual(['CX_ROOT', 'TADIR']);
        // entries a batch doesn't return are confirmed on their own
        expect(connector.checkSapEntryExists).toHaveBeenCalledTimes(1 + 28);
        const progress = (Logger.loading as jest.Mock).mock.calls.map(([message]) => message);
        expect(progress[0]).toBe('Checking 30 SAP entries: 0% (TADIR)...');
        expect(progress[progress.length - 1]).toBe('Checking 30 SAP entries: 100% (TADIR)...');
    });

    test('a batch that can\'t be read is checked entry by entry', async () => {
        connector.checkSapEntryExists.mockResolvedValue(true);
        const output = await run({ ZTAB: [{ ID: 'A' }, { ID: 'B' }] });
        expect(connector.readTable).toHaveBeenCalledTimes(1);
        expect(output.sapEntriesStatus.ZTAB.every(o => o.status)).toBe(true);
        expect(connector.checkSapEntryExists).toHaveBeenCalledWith('ZTAB', { ID: 'A' });
        expect(connector.checkSapEntryExists).toHaveBeenCalledWith('ZTAB', { ID: 'B' });
    });

    test('entries with long conditions are checked on their own', async () => {
        connector.checkSapEntryExists.mockResolvedValue(true);
        connector.readTable.mockReset().mockResolvedValue([]);
        await run({ ZTAB: [{ LONG_FIELD_NAME: 'X'.repeat(48) }] });
        expect(connector.readTable).not.toHaveBeenCalled();
        expect(connector.checkSapEntryExists).toHaveBeenCalledWith('ZTAB', { LONG_FIELD_NAME: 'X'.repeat(48) });
    });

    test('printed rows stay aligned when an entry lacks a column', async () => {
        connector.checkSapEntryExists.mockResolvedValue(true);
        await run({ ZTAB: [{ ID: 'A', NAME: 'X' }, { NAME: 'Y' }, { NAME: 'Z', ID: 'C' }] });
        expect(Logger.table).toHaveBeenCalledWith(
            ['Table name', 'ID', 'NAME', 'Status'],
            [
                ['ZTAB', 'A', 'X', 'OK'],
                ['ZTAB', '', 'Y', 'OK'],
                ['ZTAB', 'C', 'Z', 'OK']
            ],
            true
        );
    });

    test('table probe uppercases the name', async () => {
        connector.checkSapEntryExists.mockImplementation(async (table: string, entry: any) => table !== 'TADIR' || (entry.object === 'TABL' && entry.obj_name === 'ZTAB'));
        const output = await run({ ' ztab ': [{ ID: 'A' }] });
        expect(output.sapEntriesStatus[' ztab ']).toEqual([{ status: true, entry: { ID: 'A' } }]);
    });

    test('table probe falls back to database views', async () => {
        connector.checkSapEntryExists.mockImplementation(async (table: string, entry: any) => table !== 'TADIR' || entry.object === 'VIEW');
        const output = await run({ ZVIEW: [{ ID: 'A' }] });
        expect(connector.checkSapEntryExists).toHaveBeenCalledWith('TADIR', { pgmid: 'R3TR', object: 'TABL', obj_name: 'ZVIEW' });
        expect(connector.checkSapEntryExists).toHaveBeenCalledWith('TADIR', { pgmid: 'R3TR', object: 'VIEW', obj_name: 'ZVIEW' });
        expect(output.sapEntriesStatus.ZVIEW).toEqual([{ status: true, entry: { ID: 'A' } }]);
    });

    test('missing table marks every entry as failed', async () => {
        connector.checkSapEntryExists.mockResolvedValue(false);
        const output = await run({ ZTAB: [{ ID: 'A' }, { ID: 'B' }] });
        expect(output.sapEntriesStatus.ZTAB).toEqual([
            { status: false, entry: { ID: 'A' } },
            { status: false, entry: { ID: 'B' } }
        ]);
    });

    test('table probe read errors abort with the table context', async () => {
        connector.checkSapEntryExists.mockRejectedValue(new Error('NOT_AUTHORIZED'));
        await expect(run({ ZTAB: [{ ID: 'A' }] })).rejects.toThrow('Unable to check whether required SAP table "ZTAB" exists: NOT_AUTHORIZED');
    });

    test('entry read errors abort with the entry context', async () => {
        connector.checkSapEntryExists.mockImplementation(async (table: string) => {
            if (table === 'TADIR') {
                return true;
            }
            throw new Error('NOT_AUTHORIZED');
        });
        await expect(run({ ZTAB: [{ ID: 'A' }] })).rejects.toThrow('Unable to check required SAP entry {"ID":"A"} in table "ZTAB": NOT_AUTHORIZED');
    });
});
