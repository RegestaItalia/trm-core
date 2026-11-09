jest.mock('../../../systemConnector', () => ({
    SystemConnector: { getDest: jest.fn(() => 'TST'), deleteTmsTransport: jest.fn() }
}));

jest.mock('../../../transport', () => ({
    Transport: class MockTransport {
        static upload = jest.fn();
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../../systemConnector';
import { Transport } from '../../../transport';
import { protectBackupTransport } from './importQueue';
import { restoreTransport, revertPreparedTransport } from './restoreTransport';
import { runWithActionLog, setActionLogWriter } from '../../../actionLog';

describe('restore and revert of transports', () => {
    const snapshot = {
        trkorr: 'DEVK900001', entries: undefined,
        binaries: { header: Buffer.from('h'), data: Buffer.from('d') }
    } as any;
    let generated: any;
    let restored: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'success', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        generated = {
            trkorr: 'DEVK900002',
            canBeDeleted: jest.fn().mockResolvedValue(true),
            delete: jest.fn().mockResolvedValue(undefined)
        };
        restored = { import: jest.fn().mockResolvedValue(0) };
        jest.spyOn(Transport, 'upload').mockResolvedValue(restored);
    });

    test('deletes a generated dummy that is still deletable', async () => {
        await revertPreparedTransport(generated);

        expect(generated.delete).toHaveBeenCalledTimes(1);
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('a released dummy is only taken out of the queue, never re-imported', async () => {
        generated.canBeDeleted.mockResolvedValue(false);

        await revertPreparedTransport(generated);

        expect(generated.delete).not.toHaveBeenCalled();
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK900002', 'TST');
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('a backup transport is never taken out of the queue', async () => {
        generated.trkorr = 'DEVK900003';
        generated.canBeDeleted.mockResolvedValue(false);
        protectBackupTransport('DEVK900003');

        await expect(revertPreparedTransport(generated)).rejects.toThrow('is a backup');
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
    });

    test('nothing to do without a generated dummy', async () => {
        await revertPreparedTransport(undefined);

        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
    });

    test('restore imports the snapshot and succeeds up to return code 4', async () => {
        restored.import.mockResolvedValue(4);

        await restoreTransport(snapshot);

        expect(Transport.upload).toHaveBeenCalledWith(snapshot.trkorr, { binary: snapshot.binaries, trTarget: 'TST', logRole: 'BKP' });
        expect(restored.import).toHaveBeenCalledWith(false);
    });

    test.each([8, 12, -1])('restore fails with return code %s', async rc => {
        restored.import.mockResolvedValue(rc);
        restored.lastImportMessage = 'A tool used by tp produced errors';

        await expect(restoreTransport(snapshot)).rejects.toThrow(`Restore of transport ${snapshot.trkorr}`);
        expect(Logger.success).not.toHaveBeenCalled();
    });

    test('a restore of the running action is recorded as such, after its import', async () => {
        const writer = { logActionStart: jest.fn().mockResolvedValue(undefined), logActionEnd: jest.fn().mockResolvedValue(undefined), logTransportEvents: jest.fn().mockResolvedValue(undefined) };
        setActionLogWriter(writer);
        try {
            restored.import.mockResolvedValue(4);
            await runWithActionLog({ actionName: 'install' }, () => restoreTransport(snapshot));
        } finally {
            setActionLogWriter(undefined);
        }

        expect(writer.logTransportEvents).toHaveBeenCalledWith(expect.any(String), [{ trkorr: 'DEVK900001', event: 'RESTORE', role: 'BKP', target: 'TST', retcode: 4 }]);
    });
});
