jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        forwardTransport: jest.fn(),
        deleteTmsTransport: jest.fn()
    }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static getTransportIcon = jest.fn(() => 'TR');
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { releaseLandscapeTransport } from './releaseLandscapeTransport';

function context(targetSystem = 'TST') {
    const transport = {
        trkorr: 'DEVK9LAND',
        release: jest.fn().mockResolvedValue(undefined),
        canBeDeleted: jest.fn().mockResolvedValue(true),
        delete: jest.fn().mockResolvedValue(undefined)
    };
    return {
        ctx: {
            rawInput: {
                contextData: {},
                installData: { landscapeTransport: { targetSystem } }
            },
            runtime: { update: undefined },
            revert: { dele: { trkorr: 'DEVK9DELE' }, deleInTargetTms: false },
            output: { transport }
        } as any,
        transport
    };
}

describe('releaseLandscapeTransport rollback', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(SystemConnector, 'forwardTransport').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'deleteTmsTransport').mockResolvedValue(undefined);
    });

    test('marks the deletion request before forwarding can commit and throw', async () => {
        const { ctx, transport } = context();
        jest.spyOn(SystemConnector, 'forwardTransport').mockRejectedValue(new Error('response lost'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).rejects.toThrow();

        expect(ctx.revert.deleInTargetTms).toBe(true);
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9DELE', 'TST');
        expect(transport.delete).toHaveBeenCalledTimes(1);
    });

    test('release failure attempts queue and landscape-transport cleanup', async () => {
        const { ctx, transport } = context();
        transport.release.mockRejectedValue(new Error('release failed'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).rejects.toThrow();

        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledTimes(1);
        expect(transport.delete).toHaveBeenCalledTimes(1);
    });

    test('queue cleanup failure does not prevent landscape transport cleanup', async () => {
        const { ctx, transport } = context();
        transport.release.mockRejectedValue(new Error('release failed'));
        jest.spyOn(SystemConnector, 'deleteTmsTransport').mockRejectedValue(new Error('queue cleanup failed'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).rejects.toThrow();

        expect(transport.canBeDeleted).toHaveBeenCalledTimes(1);
        expect(transport.delete).toHaveBeenCalledTimes(1);
    });

    test('deletability failure still happens after queue cleanup was attempted', async () => {
        const { ctx, transport } = context();
        transport.release.mockRejectedValue(new Error('release failed'));
        transport.canBeDeleted.mockRejectedValue(new Error('status failed'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).rejects.toThrow();

        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledTimes(1);
        expect(transport.delete).not.toHaveBeenCalled();
    });

    test('a released landscape transport is removed from the import queue of the connected system', async () => {
        const { ctx, transport } = context('TST');
        transport.canBeDeleted.mockResolvedValue(false);
        const later = { name: 'later', run: async () => { throw new Error('later'); } };

        await expect(execute('test', [releaseLandscapeTransport, later], ctx)).rejects.toThrow('later');

        expect(transport.delete).not.toHaveBeenCalled();
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9LAND', 'TST');
        expect(Logger.warning).not.toHaveBeenCalled();
    });

    test('a released landscape transport queued in another system is left there with a warning', async () => {
        const { ctx, transport } = context('QAS');
        transport.canBeDeleted.mockResolvedValue(false);
        const later = { name: 'later', run: async () => { throw new Error('later'); } };

        await expect(execute('test', [releaseLandscapeTransport, later], ctx)).rejects.toThrow('later');

        expect(transport.delete).not.toHaveBeenCalled();
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9LAND'), { important: true });
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9DELE'), { important: true });
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('QAS import queue'), { important: true });
    });

    test('a failed release whose status cannot be read is reported with a warning', async () => {
        const { ctx, transport } = context();
        transport.release.mockRejectedValue(new Error('release failed'));
        transport.canBeDeleted.mockRejectedValue(new Error('status failed'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).rejects.toThrow();

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9LAND'), { important: true });
    });

    test('a failed queue removal of the released transport is surfaced', async () => {
        const { ctx, transport } = context('TST');
        transport.canBeDeleted.mockResolvedValue(false);
        jest.spyOn(SystemConnector, 'deleteTmsTransport').mockImplementation(async trkorr => {
            if (trkorr === 'DEVK9LAND') throw new Error('queue removal failed');
        });

        await expect(releaseLandscapeTransport.revert({ ...ctx, revert: { ...ctx.revert, deleInTargetTms: true, landscapeReleaseStarted: true } })).rejects.toThrow('queue removal failed');

        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9DELE', 'TST');
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9LAND', 'TST');
    });

    test('no warning when the landscape transport is deleted', async () => {
        const { ctx, transport } = context();
        transport.release.mockRejectedValue(new Error('release failed'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).rejects.toThrow();

        expect(transport.delete).toHaveBeenCalledTimes(1);
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalledWith('DEVK9LAND', expect.anything());
        expect(Logger.warning).not.toHaveBeenCalled();
    });
});
