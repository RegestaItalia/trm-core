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
        static readBinaryFiles = jest.fn();
        static writeBinaryFile = jest.fn();
        async getE070(): Promise<any> { return undefined; }
        async canBeDeleted() { return true; }
        async delete() { return undefined; }
        constructor(public trkorr: string) {}
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
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
        jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({});
        jest.spyOn(Transport, 'writeBinaryFile').mockResolvedValue(undefined);
        jest.spyOn(Transport.prototype, 'getE070').mockResolvedValue(undefined);
        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ overwrite: false });
        jest.spyOn(Transport.prototype, 'canBeDeleted').mockResolvedValue(true);
        jest.spyOn(Transport.prototype, 'delete').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'forwardTransport').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'refreshTransportTmsTxt').mockResolvedValue(undefined);
    });

    function context(options: { overwrite?: boolean, noInquirer?: boolean } = {}) {
        return {
            rawInput: {
                binaries: Buffer.from('zip'),
                contextData: { noInquirer: options.noInquirer },
                uploadData: { overwrite: options.overwrite }
            },
            runtime: {}
        } as any;
    }

    const OLD_HEADER = Buffer.from('old header');
    const OLD_DATA = Buffer.from('old data');
    const E070 = { trkorr: 'TSTK900001', trfunction: 'K', trstatus: 'D', as4Date: '20261005', as4Time: '120000' };

    test.each(['upload', 'forward'])('%s failure deletes the possibly-created SAP transport', async point => {
        const ctx = context();
        //not existing before the upload, modifiable request afterwards
        jest.spyOn(Transport.prototype, 'getE070').mockResolvedValueOnce(undefined).mockResolvedValue(E070);
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

    test('a new transport is not refreshed', async () => {
        await expect(upload.run(context())).resolves.toBeUndefined();

        expect(SystemConnector.forwardTransport).toHaveBeenCalledTimes(1);
        expect(SystemConnector.refreshTransportTmsTxt).not.toHaveBeenCalled();
    });

    test('an overwritten transport is refreshed after forwarding', async () => {
        jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: Buffer.from('old') });
        const order: string[] = [];
        jest.spyOn(SystemConnector, 'forwardTransport').mockImplementation(async () => { order.push('forward'); });
        jest.spyOn(SystemConnector, 'refreshTransportTmsTxt').mockImplementation(async () => { order.push('refresh'); });

        await expect(upload.run(context({ overwrite: true }))).resolves.toBeUndefined();

        expect(SystemConnector.refreshTransportTmsTxt).toHaveBeenCalledWith('TSTK900001');
        expect(order).toEqual(['forward', 'refresh']);
    });

    test('refresh failure of an overwritten transport remains non-fatal', async () => {
        jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: Buffer.from('old') });
        jest.spyOn(SystemConnector, 'refreshTransportTmsTxt').mockRejectedValue(new Error('refresh failed'));

        await expect(upload.run(context({ overwrite: true }))).resolves.toBeUndefined();

        expect(Transport.upload).toHaveBeenCalledTimes(1);
        expect(SystemConnector.forwardTransport).toHaveBeenCalledTimes(1);
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

    describe('existing transport', () => {
        test('a new transport is uploaded without asking', async () => {
            await upload.run(context());
            expect(Inquirer.prompt).not.toHaveBeenCalled();
            expect(Transport.upload).toHaveBeenCalledTimes(1);
        });

        test.each([
            ['request (E070)', { e070: E070, files: {} }],
            ['header file', { e070: undefined, files: { header: OLD_HEADER } }],
            ['data file', { e070: undefined, files: { data: OLD_DATA } }]
        ])('an existing %s is overwritten with overwrite=true, without asking', async (what, existing) => {
            jest.spyOn(Transport.prototype, 'getE070').mockResolvedValue(existing.e070);
            jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue(existing.files);
            const ctx = context({ overwrite: true, noInquirer: true });

            await upload.run(ctx);

            expect(Inquirer.prompt).not.toHaveBeenCalled();
            expect(Transport.upload).toHaveBeenCalledTimes(1);
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining(what));
            expect(ctx.runtime.overwritten).toEqual({ e070: !!existing.e070, header: existing.files['header'], data: existing.files['data'] });
        });

        test('overwrite=false aborts without asking or writing', async () => {
            jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: OLD_HEADER, data: OLD_DATA });

            await expect(upload.run(context({ overwrite: false }))).rejects.toThrow('Upload aborted');

            expect(Inquirer.prompt).not.toHaveBeenCalled();
            expect(Transport.upload).not.toHaveBeenCalled();
        });

        test('an error reading the existing files aborts before writing', async () => {
            jest.spyOn(Transport, 'readBinaryFiles').mockRejectedValue(new Error('GENERIC'));
            const ctx = context({ overwrite: true });

            await expect(upload.run(ctx)).rejects.toThrow('GENERIC');

            expect(Transport.upload).not.toHaveBeenCalled();
            expect(ctx.runtime.transport).toBeUndefined();
        });

        test('missing overwrite with noInquirer aborts without writing', async () => {
            jest.spyOn(Transport.prototype, 'getE070').mockResolvedValue(E070);

            await expect(upload.run(context({ noInquirer: true }))).rejects.toThrow('Set overwrite to replace it');

            expect(Inquirer.prompt).not.toHaveBeenCalled();
            expect(Transport.upload).not.toHaveBeenCalled();
        });

        test.each([true, false])('missing overwrite asks the user (answer %p)', async answer => {
            jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: OLD_HEADER });
            jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ overwrite: answer });
            const run = upload.run(context());

            if (answer) {
                await expect(run).resolves.toBeUndefined();
                expect(Transport.upload).toHaveBeenCalledTimes(1);
            } else {
                await expect(run).rejects.toThrow('Upload aborted');
                expect(Transport.upload).not.toHaveBeenCalled();
            }
            expect(Inquirer.prompt).toHaveBeenCalledWith(expect.objectContaining({ type: 'confirm', name: 'overwrite', default: false }));
        });

        test('the stop warning is shown only after overwrite is confirmed', async () => {
            jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: OLD_HEADER });

            await expect(upload.run(context({ overwrite: false }))).rejects.toThrow();

            expect(Logger.warning).not.toHaveBeenCalledWith(expect.stringContaining('Do not interrupt'));
        });
    });

    describe('overwrite rollback', () => {
        test.each(['upload', 'forward'])('%s failure restores overwritten files of a foreign transport', async point => {
            jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: OLD_HEADER, data: OLD_DATA });
            if (point === 'upload') {
                jest.spyOn(Transport, 'upload').mockRejectedValue(new Error('upload failed'));
            } else {
                jest.spyOn(SystemConnector, 'forwardTransport').mockRejectedValue(new Error('forward failed'));
            }
            const ctx = context({ overwrite: true });

            await expect(execute('test', [upload], ctx)).rejects.toThrow();

            expect(Transport.prototype.delete).not.toHaveBeenCalled();
            expect(Transport.writeBinaryFile).toHaveBeenCalledWith('TSTK900001', 'header', OLD_HEADER);
            expect(Transport.writeBinaryFile).toHaveBeenCalledWith('TSTK900001', 'data', OLD_DATA);
        });

        test('a request that existed before the upload is never deleted', async () => {
            jest.spyOn(Transport.prototype, 'getE070').mockResolvedValue(E070);
            jest.spyOn(Transport, 'readBinaryFiles').mockResolvedValue({ header: OLD_HEADER });
            jest.spyOn(SystemConnector, 'forwardTransport').mockRejectedValue(new Error('forward failed'));
            const ctx = context({ overwrite: true });

            await expect(execute('test', [upload], ctx)).rejects.toThrow();

            expect(Transport.prototype.canBeDeleted).not.toHaveBeenCalled();
            expect(Transport.prototype.delete).not.toHaveBeenCalled();
            expect(Transport.writeBinaryFile).toHaveBeenCalledTimes(1);
            expect(Transport.writeBinaryFile).toHaveBeenCalledWith('TSTK900001', 'header', OLD_HEADER);
        });

        function failedRun() {
            const ctx = context();
            ctx.runtime.transport = new Transport('TSTK900001');
            return ctx;
        }

        test('restore continues after one file fails and surfaces the first failure', async () => {
            const ctx = failedRun();
            ctx.runtime.overwritten = { e070: false, header: OLD_HEADER, data: OLD_DATA };
            jest.spyOn(Transport, 'writeBinaryFile').mockRejectedValueOnce(new Error('header restore failed')).mockResolvedValue(undefined);

            await expect(upload.revert(ctx)).rejects.toThrow('header restore failed');

            expect(Transport.writeBinaryFile).toHaveBeenCalledTimes(2);
            expect(Transport.writeBinaryFile).toHaveBeenLastCalledWith('TSTK900001', 'data', OLD_DATA);
        });

        test('files are not restored when deleting the created request fails', async () => {
            const ctx = failedRun();
            ctx.runtime.overwritten = { e070: false, header: OLD_HEADER };
            jest.spyOn(Transport.prototype, 'getE070').mockResolvedValue(E070);
            jest.spyOn(Transport.prototype, 'delete').mockRejectedValue(new Error('delete failed'));

            await expect(upload.revert(ctx)).rejects.toThrow('delete failed');

            expect(Transport.writeBinaryFile).not.toHaveBeenCalled();
        });

        test('a transport without E070 row is not deleted and does not throw', async () => {
            const ctx = failedRun();

            await expect(upload.revert(ctx)).resolves.toBeUndefined();

            expect(Transport.prototype.canBeDeleted).not.toHaveBeenCalled();
            expect(Transport.prototype.delete).not.toHaveBeenCalled();
        });
    });
});
