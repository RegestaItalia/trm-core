jest.mock('../../../systemConnector', () => ({
    SystemConnector: { getDest: jest.fn(() => 'TST') }
}));

jest.mock('../../../transport', () => ({
    Transport: class MockTransport {
        static upload = jest.fn();
    }
}));

import { Logger } from 'trm-commons';
import { Transport } from '../../../transport';
import { revertPreparedTransport } from './restoreTransport';

describe('revertPreparedTransport', () => {
    const snapshot = {
        trkorr: 'DEVK900001', entries: undefined,
        binaries: { header: Buffer.from('h'), data: Buffer.from('d') }
    } as any;
    let generated: any;
    let restored: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'success'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        generated = {
            canBeDeleted: jest.fn().mockResolvedValue(true),
            delete: jest.fn().mockResolvedValue(undefined)
        };
        restored = { import: jest.fn().mockResolvedValue(undefined) };
        jest.spyOn(Transport, 'upload').mockResolvedValue(restored);
    });

    test('deletes a generated dummy that has not replaced SAP payload', async () => {
        await revertPreparedTransport(generated, undefined);

        expect(generated.delete).toHaveBeenCalledTimes(1);
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('deletes a still-deletable dummy instead of importing its snapshot', async () => {
        await revertPreparedTransport(generated, snapshot);

        expect(generated.delete).toHaveBeenCalledTimes(1);
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('restores the old payload when the generated request is no longer deletable', async () => {
        generated.canBeDeleted.mockResolvedValue(false);

        await revertPreparedTransport(generated, snapshot);

        expect(generated.delete).not.toHaveBeenCalled();
        expect(Transport.upload).toHaveBeenCalledWith(snapshot.trkorr, {
            binary: snapshot.binaries, trTarget: 'TST'
        });
        expect(restored.import).toHaveBeenCalledWith(false);
    });

    test('falls back to snapshot restoration when deletability lookup fails', async () => {
        generated.canBeDeleted.mockRejectedValue(new Error('status failed'));

        await revertPreparedTransport(generated, snapshot);

        expect(Transport.upload).toHaveBeenCalledTimes(1);
        expect(restored.import).toHaveBeenCalledWith(false);
    });

    test('reports a deletability failure when no snapshot exists', async () => {
        generated.canBeDeleted.mockRejectedValue(new Error('status failed'));

        await expect(revertPreparedTransport(generated, undefined)).rejects.toThrow('status failed');
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('restores a snapshot even when no generated request instance was retained', async () => {
        await revertPreparedTransport(undefined, snapshot);

        expect(Transport.upload).toHaveBeenCalledTimes(1);
        expect(restored.import).toHaveBeenCalledWith(false);
    });
});
