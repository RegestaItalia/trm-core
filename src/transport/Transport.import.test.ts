jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        forwardTransport: jest.fn(),
        importTransport: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { Transport } from './Transport';

describe('Transport import', () => {
    function transport() {
        const t = new Transport('TSTK900001');
        (t as any)._trTarget = 'TST';
        return t;
    }

    beforeEach(() => {
        jest.resetAllMocks();
        for (const method of ['loading', 'log', 'success', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.importTransport as jest.Mock).mockResolvedValue({ tpRetCode: '0000', tpStdout: [{ line: 'Going offline now.....BYE.' }] });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('waits for an import tp handed over to the background, and returns its final return code', async () => {
        const t = transport();
        const queue = jest.spyOn(t as any, '_isInTmsQueue').mockResolvedValue({ rc: 4, message: 'warnings' });

        await expect(t.import(false)).resolves.toBe(4);
        expect(queue).toHaveBeenCalledWith(false, true);
    });

    test('a test import, or a tp error, returns at once', async () => {
        const t = transport();
        const queue = jest.spyOn(t as any, '_isInTmsQueue');

        await expect(t.import(true)).resolves.toBe(0);
        (SystemConnector.importTransport as jest.Mock).mockResolvedValue({ tpRetCode: '0012', tpStdout: [] });
        await expect(t.import(false)).resolves.toBe(12);
        expect(queue).not.toHaveBeenCalled();
    });

    test('a failed forward or import names the operation, the transport and the system', async () => {
        const t = transport();
        (SystemConnector.forwardTransport as jest.Mock).mockRejectedValueOnce(new Error('tp ended with error code 0203'));
        await expect(t.import(true)).rejects.toThrow('Forward of transport TSTK900001 to TST failed: tp ended with error code 0203');

        (SystemConnector.importTransport as jest.Mock).mockRejectedValueOnce(new Error('no buffer'));
        await expect(t.import(true)).rejects.toThrow('Test import of transport TSTK900001 to TST failed: no buffer');
    });

    test('a queue without a return code keeps the tp return code', async () => {
        const t = transport();
        jest.spyOn(t as any, '_isInTmsQueue').mockResolvedValue({ rc: -1 });

        await expect(t.import(false)).resolves.toBe(0);
    });
});

import { TransportImportError } from './TransportImportError';

describe('TransportImportError.assert', () => {
    afterEach(() => jest.restoreAllMocks());

    test('return codes up to 4 pass', () => {
        expect(() => TransportImportError.assert('TSTK1', 4, 'Import')).not.toThrow();
    });

    test.each([8, 12, -1])('return code %s fails', rc => {
        expect(() => TransportImportError.assert('TSTK1', rc, 'Import', 'msg')).toThrow(TransportImportError);
    });

    test('ignored, return codes from 8 are logged as errors', () => {
        const error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);

        expect(() => TransportImportError.assert('TSTK1', 8, 'Import of transport TSTK1', 'tp errors', true)).not.toThrow();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('TSTK1 ended with return code 8 (tp errors)'), { important: true });
    });

    test('ignored, a transport without return code (not imported) still fails', () => {
        expect(() => TransportImportError.assert('TSTK1', -1, 'Import', undefined, true)).toThrow(TransportImportError);
    });
});
