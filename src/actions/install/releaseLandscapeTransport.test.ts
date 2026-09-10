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

function context() {
    const transport = {
        release: jest.fn().mockResolvedValue(undefined),
        canBeDeleted: jest.fn().mockResolvedValue(true),
        delete: jest.fn().mockResolvedValue(undefined)
    };
    return {
        ctx: {
            rawInput: {
                contextData: {},
                installData: { landscapeTransport: { targetSystem: 'QAS' } }
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
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9DELE', 'QAS');
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
});
