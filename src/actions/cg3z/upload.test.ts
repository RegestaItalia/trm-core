jest.mock('adm-zip', () => ({
    __esModule: true,
    default: class MockZip {
        forEach(callback: (entry: any) => void) {
            callback({ entryName: 'K900001.TST', getData: () => Buffer.from('header') });
            callback({ entryName: 'R900001.TST', getData: () => Buffer.from('data') });
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
        static getTrkorrFromFileName = jest.fn(() => 'TSTK900001');
        async canBeDeleted() { return true; }
        async delete() { return undefined; }
        constructor(public trkorr: string) {}
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { upload } from './upload';

describe('cg3z upload rollback', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
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
        expect(Logger.warning).toHaveBeenCalledTimes(1);
    });
});
