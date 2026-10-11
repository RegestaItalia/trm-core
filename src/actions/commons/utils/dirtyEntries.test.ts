jest.mock('../../../transport', () => ({
    Transport: jest.fn().mockImplementation((trkorr: string) => ({
        getTrmPackageName: jest.fn(async () => ({ TRMK1: 'pkg', TRMK2: 'other' } as Record<string, string>)[trkorr])
    }))
}));

import { Logger } from 'trm-commons';
import { logDirtyEntries, withoutOwnTrmTransports } from './dirtyEntries';

describe('logDirtyEntries', () => {
    afterEach(() => jest.restoreAllMocks());

    test('shows the request text, whichever connector returned it', () => {
        const table = jest.spyOn(Logger, 'table').mockImplementation(() => undefined as never);
        logDirtyEntries([
            { trkorr: 'A4HK900001', pgmid: 'R3TR', object: 'PROG', objName: 'ZA', as4Text: 'RFC text' } as any,
            { trkorr: 'A4HK900002', pgmid: 'R3TR', object: 'PROG', objName: 'ZB', as4text: 'REST text' } as any
        ]);
        expect(table).toHaveBeenCalledWith(['Transport', 'Description', 'Object'], [
            ['A4HK900001', 'RFC text', 'R3TR PROG ZA'],
            ['A4HK900002', 'REST text', 'R3TR PROG ZB']
        ]);
    });
});

describe('withoutOwnTrmTransports', () => {
    test('drops the entries of transports TRM generated for the package itself', async () => {
        const entries = [
            { trkorr: 'TRMK1', pgmid: 'R3TR', object: 'INTF', objName: 'ZIF' },
            { trkorr: 'TRMK2', pgmid: 'R3TR', object: 'INTF', objName: 'ZIF' },
            { trkorr: 'DEVK1', pgmid: 'R3TR', object: 'PROG', objName: 'ZP' }
        ] as any[];
        await expect(withoutOwnTrmTransports(entries, 'pkg')).resolves.toEqual([entries[1], entries[2]]);
    });
});
