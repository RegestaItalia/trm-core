jest.mock('../checkSapEntries', () => ({
    checkSapEntries: jest.fn()
}));

import { Logger } from 'trm-commons';
import { checkSapEntries as checkSapEntriesWkf } from '../checkSapEntries';
import { checkSapEntries } from './checkSapEntries';

const workflowMock = checkSapEntriesWkf as jest.Mock;

function context(noSapEntries = false) {
    return {
        rawInput: { installData: { checks: { noSapEntries } } },
        runtime: { package: { data: { manifest: { name: 'test', version: '1.0.0', sapEntries: {} } } } }
    } as any;
}

describe('install checkSapEntries step', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['log', 'loading', 'success', 'error'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('is skipped with noSapEntries', async () => {
        expect(await checkSapEntries.filter(context(true))).toBe(false);
        expect(await checkSapEntries.filter(context())).toBe(true);
    });

    test('passes when all entries exist', async () => {
        workflowMock.mockResolvedValue({ sapEntries: {}, sapEntriesStatus: { ZTAB: [{ status: true, entry: { ID: 'A' } }] } });
        await expect(checkSapEntries.run(context())).resolves.toBeUndefined();
        expect(Logger.error).not.toHaveBeenCalled();
    });

    test('logs each missing entry at error level before aborting', async () => {
        workflowMock.mockResolvedValue({
            sapEntries: {},
            sapEntriesStatus: {
                ZTAB: [{ status: true, entry: { ID: 'A' } }, { status: false, entry: { ID: 'B', NAME: 'X' } }],
                ZOTHER: [{ status: false, entry: { KEY: '1' } }]
            }
        });
        await expect(checkSapEntries.run(context())).rejects.toThrow('Install aborted. 2 system requirements are not met!');
        expect((Logger.error as jest.Mock).mock.calls).toEqual([
            ['Required entry not found in table ZTAB: ID = B, NAME = X'],
            ['Required entry not found in table ZOTHER: KEY = 1']
        ]);
    });
});
