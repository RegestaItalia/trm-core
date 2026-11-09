jest.mock('timers/promises', () => ({ setTimeout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getTransportImportStatus: jest.fn(),
        readTmsQueue: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { Transport } from './Transport';

const TRKORR = 'TSTK900001';

function status(state: 'R' | 'F', retcode: string, message: string, trkorr = TRKORR) {
    return { command: 'IMPORT', trkorr, status: state, retcode, step: state === 'F' ? '?' : 'I', moddate: '20261014', modtime: '213626', message };
}

function queueRow(impsing: string, maxrc: string) {
    return { trkorr: TRKORR, bufpos: '000010', impsing, maxrc };
}

describe('Transport import polling', () => {
    const getStatus = SystemConnector.getTransportImportStatus as jest.Mock;
    const readQueue = SystemConnector.readTmsQueue as jest.Mock;

    function poll() {
        const t = new Transport(TRKORR, 'TST');
        return (t as any)._isInTmsQueue(true) as Promise<{ rc: number, message?: string }>;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'success', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    test('while the request status is running the whole queue is not read', async () => {
        getStatus
            .mockResolvedValueOnce(status('R', '8888', 'running MAIN IMPORT'))
            .mockResolvedValueOnce(status('R', '8888', 'running MAIN IMPORT'))
            .mockResolvedValueOnce(status('F', '0004', 'Import finished'));
        readQueue.mockResolvedValue([queueRow('', '0004')]);

        await expect(poll()).resolves.toEqual({ rc: 4, message: 'Import finished' });
        expect(readQueue).toHaveBeenCalledTimes(1);
    });

    test('a final tp return code higher than the queue one is the result', async () => {
        getStatus.mockResolvedValue(status('F', '0008', 'A tool used by tp produced errors'));
        readQueue.mockResolvedValue([queueRow('', '0004')]);

        await expect(poll()).resolves.toEqual({ rc: 8, message: 'A tool used by tp produced errors' });
    });

    test('in a batch the tp return code is the whole batch one: the request queue return code is the result', async () => {
        getStatus.mockResolvedValue(status('F', '0008', 'A tool used by tp produced errors'));
        readQueue.mockResolvedValue([queueRow('', '0004')]);
        const t = new Transport(TRKORR, 'TST');

        await expect((t as any)._isInTmsQueue(true, true)).resolves.toEqual({ rc: 4, message: undefined });
    });

    test('in a batch a request that failed keeps its return code and the tp message', async () => {
        getStatus.mockResolvedValue(status('F', '0008', 'A tool used by tp produced errors'));
        readQueue.mockResolvedValue([queueRow('', '0008')]);
        const t = new Transport(TRKORR, 'TST');

        await expect((t as any)._isInTmsQueue(true, true)).resolves.toEqual({ rc: 8, message: 'A tool used by tp produced errors' });
    });

    test('a status row of another request of the batch is ignored: the queue decides', async () => {
        getStatus.mockResolvedValue(status('F', '0012', 'other request', 'TSTK900002'));
        readQueue
            .mockResolvedValueOnce([queueRow('X', '')])
            .mockResolvedValueOnce([queueRow('', '0004')]);

        await expect(poll()).resolves.toEqual({ rc: 4, message: undefined });
        expect(readQueue).toHaveBeenCalledTimes(2);
        for (const [message] of (Logger.loading as jest.Mock).mock.calls) {
            expect(message).not.toContain('other request');
        }
    });

    test('without a readable status (virtual target, older backend) the queue decides', async () => {
        getStatus.mockRejectedValue(new Error('not found'));
        readQueue.mockResolvedValueOnce([]).mockResolvedValueOnce([queueRow('', '0000')]);

        await expect(poll()).resolves.toEqual({ rc: 0, message: undefined });
    });

    test('a final status not yet reflected in the queue is checked again', async () => {
        getStatus.mockResolvedValue(status('F', '0000', 'done'));
        readQueue.mockResolvedValueOnce([queueRow('X', '')]).mockResolvedValueOnce([queueRow('', '0000')]);

        await expect(poll()).resolves.toEqual({ rc: 0, message: 'done' });
        expect(readQueue).toHaveBeenCalledTimes(2);
    });

    test('a queue entry without return code is -1 (not imported)', async () => {
        getStatus.mockResolvedValue(status('F', '0000', 'done'));
        readQueue.mockResolvedValue([queueRow('', '')]);

        await expect(poll()).resolves.toEqual({ rc: 0, message: 'done' });
        getStatus.mockRejectedValue(new Error('not found'));
        await expect(poll()).resolves.toEqual({ rc: -1, message: undefined });
    });
});
