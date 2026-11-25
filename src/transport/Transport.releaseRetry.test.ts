jest.mock('timers/promises', () => ({
    setTimeout: jest.fn(async () => undefined)
}));
jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        readTable: jest.fn(),
        deleteTrkorr: jest.fn(),
        releaseTrkorr: jest.fn()
    }
}));

import { setTimeout } from 'timers/promises';
import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { ClientError } from '../client/ClientError';
import { Transport } from './Transport';
import { getReleaseTpCheckReturnCode, isTpInternalReturnCode, TransportReleaseTpError } from './TransportReleaseTpError';

const TRKORR = 'TSTK900001';

function tpCheckError(returnCode: string): ClientError {
    return new ClientError('GENERIC', {
        class: 'TK',
        no: '094',
        v1: `EXPCHK ${TRKORR} pf=\\\\HOST\\sapmnt\\trans\\bin`,
        v2: '\\TP_DOMAIN_TST.PFL -DSYSTEM_PF',
        v3: returnCode,
        v4: `ERRORS: Highest tp internal error was: ${returnCode}`
    }, `Test call of transport control program (tp) ended with return code ${returnCode}`, '/ATRM/RELEASE_TR');
}

function mockStatus(...statuses: (string | null)[]) {
    const readTable = SystemConnector.readTable as jest.Mock;
    for (const status of statuses) {
        readTable.mockResolvedValueOnce(status === null ? [] : [{ trkorr: TRKORR, trstatus: status }]);
    }
}

function newTransport(): Transport {
    const transport = new Transport(TRKORR);
    jest.spyOn(transport as any, '_getReleaseLogSize').mockResolvedValue(0);
    jest.spyOn(transport as any, '_waitExport').mockResolvedValue(0);
    jest.spyOn(transport as any, '_refreshReusedTmsText').mockResolvedValue(undefined);
    return transport;
}

describe('release tp check return code', () => {
    test('reads the return code of TK 094 only', () => {
        expect(getReleaseTpCheckReturnCode(tpCheckError('0203'))).toBe(203);
        expect(getReleaseTpCheckReturnCode(new ClientError('GENERIC', { class: 'TK', no: '095', v3: '0203' }))).toBeUndefined();
        expect(getReleaseTpCheckReturnCode(new Error('release failed'))).toBeUndefined();
        expect(getReleaseTpCheckReturnCode(undefined)).toBeUndefined();
    });

    test('tp internal errors are 02xx', () => {
        expect(isTpInternalReturnCode(203)).toBe(true);
        expect(isTpInternalReturnCode(212)).toBe(true);
        expect(isTpInternalReturnCode(12)).toBe(false);
        expect(isTpInternalReturnCode(8)).toBe(false);
        expect(isTpInternalReturnCode(undefined)).toBe(false);
    });
});

describe('Transport release retry on tp internal errors', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        (SystemConnector.getDest as jest.Mock).mockReturnValue('TST');
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined);
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    });

    test('a temporary tp internal error is retried and the release completes', async () => {
        (SystemConnector.releaseTrkorr as jest.Mock)
            .mockRejectedValueOnce(tpCheckError('0203'))
            .mockResolvedValueOnce(undefined);
        mockStatus('D', 'R');
        const transport = newTransport();

        await transport.release(false, true);

        expect(SystemConnector.releaseTrkorr).toHaveBeenCalledTimes(2);
        expect(setTimeout).toHaveBeenCalledTimes(1);
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('tp internal error 0203'));
        await expect(transport.isReleased()).resolves.toBe(true);
    });

    test('a persistent tp internal error fails with an explanation and leaves the request for rollback', async () => {
        const original = tpCheckError('0203');
        (SystemConnector.releaseTrkorr as jest.Mock).mockRejectedValue(original);
        mockStatus('D', 'D', 'D', 'D');
        const transport = newTransport();

        const error = await transport.release(false, true).catch(e => e);

        expect(error).toBeInstanceOf(TransportReleaseTpError);
        expect(error.originalError).toBe(original);
        expect(error.returnCode).toBe(203);
        expect(error.attempts).toBe(3);
        expect(error.message).toContain('tp internal error 0203');
        expect(error.message).toContain('not the package content');
        expect(error.message).toContain('SAP Basis');
        expect(error.message).toContain('STMS');
        expect(SystemConnector.releaseTrkorr).toHaveBeenCalledTimes(3);
        expect(setTimeout).toHaveBeenCalledTimes(2);
        expect((setTimeout as unknown as jest.Mock).mock.calls.map(o => o[0])).toEqual([5000, 10000]);
        //the release-transport revert deletes the request
        await expect(transport.canBeDeleted()).resolves.toBe(true);
        await transport.delete();
        expect(SystemConnector.deleteTrkorr).toHaveBeenCalledWith(TRKORR);
    });

    test('a request that is no longer modifiable is never released again', async () => {
        const original = tpCheckError('0203');
        (SystemConnector.releaseTrkorr as jest.Mock).mockRejectedValue(original);
        mockStatus('O', 'O');
        const transport = newTransport();

        await expect(transport.release(false, true)).rejects.toBe(original);

        expect(SystemConnector.releaseTrkorr).toHaveBeenCalledTimes(1);
        expect(setTimeout).not.toHaveBeenCalled();
        await expect(transport.canBeDeleted()).resolves.toBe(false);
    });

    test('a status read failure stops the retry and surfaces the release error', async () => {
        const original = tpCheckError('0203');
        (SystemConnector.releaseTrkorr as jest.Mock).mockRejectedValue(original);
        (SystemConnector.readTable as jest.Mock).mockRejectedValueOnce(new Error('status failed'));
        const transport = newTransport();

        await expect(transport.release(false, true)).rejects.toBe(original);

        expect(SystemConnector.releaseTrkorr).toHaveBeenCalledTimes(1);
        expect(setTimeout).not.toHaveBeenCalled();
    });

    test.each([
        ['another release error', new Error('release failed')],
        ['a tp check error that is not internal', tpCheckError('0012')]
    ])('%s is not retried', async (_, original) => {
        (SystemConnector.releaseTrkorr as jest.Mock).mockRejectedValue(original);
        mockStatus('D');
        const transport = newTransport();

        await expect(transport.release(false, true)).rejects.toBe(original);

        expect(SystemConnector.releaseTrkorr).toHaveBeenCalledTimes(1);
        expect(SystemConnector.readTable).not.toHaveBeenCalled();
        expect(setTimeout).not.toHaveBeenCalled();
        //the status cache is still invalidated
        await expect(transport.canBeDeleted()).resolves.toBe(true);
    });
});
