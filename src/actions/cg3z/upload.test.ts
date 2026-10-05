const DEFAULT_ENTRIES = ['K900001.TST', 'R900001.TST'];
let mockEntryNames: string[] = DEFAULT_ENTRIES;

jest.mock('adm-zip', () => ({
    __esModule: true,
    default: class MockZip {
        forEach(callback: (entry: any) => void) {
            for (const entryName of mockEntryNames) {
                callback({ entryName, isDirectory: entryName.endsWith('/'), getData: () => Buffer.from(entryName) });
            }
        }
    }
}));

jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        forwardTransport: jest.fn(),
        refreshTransportTmsTxt: jest.fn()
    }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static upload = jest.fn();
        static getTransportIcon = jest.fn(() => 'TR');
        async canBeDeleted() { return true; }
        async delete() { return undefined; }
        constructor(public trkorr: string) {}
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { parseTransportArchive, upload } from './upload';

describe('cg3z upload rollback', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        mockEntryNames = DEFAULT_ENTRIES;
        for (const method of ['loading', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Transport, 'upload').mockResolvedValue({} as Transport);
        jest.spyOn(Transport.prototype, 'canBeDeleted').mockResolvedValue(true);
        jest.spyOn(Transport.prototype, 'delete').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'forwardTransport').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'refreshTransportTmsTxt').mockResolvedValue(undefined);
    });

    function context() {
        return { rawInput: { binaries: Buffer.from('zip') }, runtime: {} } as any;
    }

    test.each(['upload', 'forward'])('%s failure deletes the possibly-created SAP transport', async point => {
        const ctx = context();
        if (point === 'upload') {
            jest.spyOn(Transport, 'upload').mockRejectedValue(new Error('upload failed'));
        } else {
            jest.spyOn(SystemConnector, 'forwardTransport').mockRejectedValue(new Error('forward failed'));
        }

        await expect(execute('test', [upload], ctx)).rejects.toThrow();

        expect(ctx.runtime.transport).toBeDefined();
        expect(ctx.runtime.transport.canBeDeleted).toHaveBeenCalledTimes(1);
        expect(ctx.runtime.transport.delete).toHaveBeenCalledTimes(1);
    });

    test('refresh failure remains non-fatal after upload and forward succeed', async () => {
        const ctx = context();
        jest.spyOn(SystemConnector, 'refreshTransportTmsTxt').mockRejectedValue(new Error('refresh failed'));

        await expect(upload.run(ctx)).resolves.toBeUndefined();

        expect(Transport.upload).toHaveBeenCalledTimes(1);
        expect(SystemConnector.forwardTransport).toHaveBeenCalledTimes(1);
        expect(Logger.warning).toHaveBeenCalledTimes(2);
        expect(Logger.warning).toHaveBeenLastCalledWith(expect.stringContaining('refresh failed'));
    });

    test('shows the stop warning before writing to SAP', async () => {
        const ctx = context();
        const order: string[] = [];
        (Logger.warning as jest.Mock).mockImplementation((msg: string) => { order.push(`warning:${msg}`); });
        jest.spyOn(Transport, 'upload').mockImplementation(async () => { order.push('upload'); return {} as Transport; });
        await upload.run(ctx);
        expect(order[0]).toMatch(/^warning:.*cg3z.*Do not interrupt/);
        expect(order[1]).toBe('upload');
    });

    describe('archive entry names', () => {
        test.each([
            [['K900001.TST', 'R900001.TST'], 'TSTK900001'],
            [['k900001.npl', 'r900001.npl'], 'NPLK900001'],
            [['trans/', 'trans/K900001.TST', 'trans/R900001.TST'], 'TSTK900001'],
            [['cofiles\\K900001.TST', 'data\\R900001.TST'], 'TSTK900001'],
            [['README.txt', 'Release notes.md', 'K900001.TST', 'R900001.TST', 'Kfoo/', '__MACOSX/._K900001.TST'], 'TSTK900001']
        ])('%p identifies %s', (entries, trkorr) => {
            mockEntryNames = entries;
            const archive = parseTransportArchive(Buffer.from('zip'));
            expect(archive.trkorr).toBe(trkorr);
            expect(archive.header.entryName).toMatch(/K900001\.(TST|npl)$/i);
            expect(archive.data.entryName).toMatch(/R900001\.(TST|npl)$/i);
        });

        test.each([
            [['K900001.TST'], 'found 1 header(s) and 0 data file(s)'],
            [['K900001.TST', 'K900002.TST', 'R900001.TST'], 'found 2 header(s) and 1 data file(s)'],
            [['README.txt', 'R900001.TST'], 'found 0 header(s) and 1 data file(s)'],
            [['K900001.TST', 'R900002.TST'], "don't match"]
        ])('%p is rejected', (entries, message) => {
            mockEntryNames = entries;
            expect(() => parseTransportArchive(Buffer.from('zip'))).toThrow(message);
        });

        test('lowercase entries are uploaded under the uppercase transport number', async () => {
            mockEntryNames = ['k900001.npl', 'r900001.npl'];
            const ctx = context();
            await upload.run(ctx);
            expect(Transport.upload).toHaveBeenCalledWith('NPLK900001', expect.anything());
            expect(ctx.output.trkorr).toBe('NPLK900001');
        });
    });
});
