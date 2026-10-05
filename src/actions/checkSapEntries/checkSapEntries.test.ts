jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        checkSapEntryExists: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { checkSapEntries } from '.';

const connector = SystemConnector as unknown as {
    checkSapEntryExists: jest.Mock
};

function run(sapEntries: any) {
    return checkSapEntries({ packageData: { manifest: { name: 'test', version: '1.0.0', sapEntries } } });
}

describe('checkSapEntries', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['info', 'log', 'table', 'error', 'loading', 'success'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('statuses are emitted in declaration order', async () => {
        connector.checkSapEntryExists.mockImplementation(async (table: string, entry: any) => table === 'TADIR' || entry.ID !== 'B');
        const output = await run({ ZTAB: [{ ID: 'A' }, { ID: 'B' }, { ID: 'C' }] });
        expect(output.sapEntriesStatus.ZTAB).toEqual([
            { status: true, entry: { ID: 'A' } },
            { status: false, entry: { ID: 'B' } },
            { status: true, entry: { ID: 'C' } }
        ]);
    });

    test('missing table marks every entry as failed', async () => {
        connector.checkSapEntryExists.mockResolvedValue(false);
        const output = await run({ ZTAB: [{ ID: 'A' }, { ID: 'B' }] });
        expect(output.sapEntriesStatus.ZTAB).toEqual([
            { status: false, entry: { ID: 'A' } },
            { status: false, entry: { ID: 'B' } }
        ]);
    });
});
