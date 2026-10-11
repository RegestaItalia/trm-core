jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST')
    }
}));

import { Logger } from 'trm-commons';
import { Transport } from '../../transport';
import { download } from './download';

const HEADER = Buffer.from('header');
const DATA = Buffer.from('data');

function context(trkorr: string) {
    return { rawInput: { trkorr } } as any;
}

function mockTransport(e070: any, binaries: { header: Buffer, data: Buffer } = { header: HEADER, data: DATA }) {
    jest.spyOn(Transport.prototype, 'getE070').mockResolvedValue(e070);
    jest.spyOn(Transport.prototype, 'isReleased').mockResolvedValue(!!e070 && (e070.trstatus === 'R' || e070.trstatus === 'N'));
    return jest.spyOn(Transport.prototype, 'download').mockResolvedValue({
        binaries,
        filenames: { header: 'K900001.TST', data: 'R900001.TST' }
    } as any);
}

describe('cg3y download', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
    });

    test('zips a released request with a target system', async () => {
        mockTransport({ trkorr: 'TSTK900001', trfunction: 'K', trstatus: 'R', tarsystem: 'QAS' });
        const ctx = context(' tstk900001 ');
        await download.run(ctx);
        expect(ctx.output.binaries.length).toBeGreaterThan(0);
    });

    test.each(['', 'TSTK90001', 'TSTX900001', "TSTK900001' OR '1'='1"])('rejects invalid transport number %p', async (trkorr) => {
        const getE070 = jest.spyOn(Transport.prototype, 'getE070');
        await expect(download.run(context(trkorr))).rejects.toThrow('Invalid transport number');
        expect(getE070).not.toHaveBeenCalled();
    });

    test('rejects missing transports', async () => {
        mockTransport(undefined);
        await expect(download.run(context('TSTK900001'))).rejects.toThrow('was not found');
    });

    test.each(['S', 'R', 'Q', 'X'])('rejects released tasks (%s)', async (trfunction) => {
        const dl = mockTransport({ trkorr: 'TSTK900001', trfunction, trstatus: 'R', tarsystem: '' });
        await expect(download.run(context('TSTK900001'))).rejects.toThrow('is a task');
        expect(dl).not.toHaveBeenCalled();
    });

    test('rejects unreleased requests', async () => {
        const dl = mockTransport({ trkorr: 'TSTK900001', trfunction: 'K', trstatus: 'D', tarsystem: 'QAS' });
        await expect(download.run(context('TSTK900001'))).rejects.toThrow('is not released');
        expect(dl).not.toHaveBeenCalled();
    });

    test('rejects local requests', async () => {
        const dl = mockTransport({ trkorr: 'TSTK900001', trfunction: 'K', trstatus: 'R', tarsystem: ' ' });
        await expect(download.run(context('TSTK900001'))).rejects.toThrow('local request');
        expect(dl).not.toHaveBeenCalled();
    });

    test.each([
        ['header', { header: Buffer.alloc(0), data: DATA }],
        ['data', { header: HEADER, data: Buffer.alloc(0) }],
        ['missing', { header: null, data: DATA }]
    ])('rejects empty export files (%s)', async (_, binaries) => {
        mockTransport({ trkorr: 'TSTK900001', trfunction: 'W', trstatus: 'R', tarsystem: 'QAS' }, binaries as any);
        const ctx = context('TSTK900001');
        await expect(download.run(ctx)).rejects.toThrow('missing or empty');
        expect(ctx.output).toBeUndefined();
    });
});
