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
        expect(queue).toHaveBeenCalledWith(true, true);
    });

    test('a test import, or a tp error, returns at once', async () => {
        const t = transport();
        const queue = jest.spyOn(t as any, '_isInTmsQueue');

        await expect(t.import(true)).resolves.toBe(0);
        (SystemConnector.importTransport as jest.Mock).mockResolvedValue({ tpRetCode: '0012', tpStdout: [] });
        await expect(t.import(false)).resolves.toBe(12);
        expect(queue).not.toHaveBeenCalled();
    });

    test('a queue without a return code keeps the tp return code', async () => {
        const t = transport();
        jest.spyOn(t as any, '_isInTmsQueue').mockResolvedValue({ rc: -1 });

        await expect(t.import(false)).resolves.toBe(0);
    });
});
