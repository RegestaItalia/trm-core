jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'DEV'),
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
import { forwardDeletionTransport } from './forwardDeletionTransport';

function context(options: { targetSystem?: string, devclass?: string } = { targetSystem: 'QAS' }) {
    return {
        rawInput: {
            deleteData: { landscapeTransport: { targetSystem: options.targetSystem } }
        },
        runtime: { update: { getDevclass: () => options.devclass || 'ZPKG' } },
        revert: { sapPackages: [], dele: { trkorr: 'DEVK9DELE' }, deleInTargetTms: false },
        output: {}
    } as any;
}

describe('forwardDeletionTransport', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'success').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        (SystemConnector.forwardTransport as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.deleteTmsTransport as jest.Mock).mockResolvedValue(undefined);
    });

    test('adds the deletion transport to the landscape target queue', async () => {
        const ctx = context();

        await execute('test', [forwardDeletionTransport], ctx);

        expect(SystemConnector.forwardTransport).toHaveBeenCalledWith('DEVK9DELE', 'QAS', 'DEV', true);
        expect(ctx.output.targetSystem).toBe('QAS');
    });

    test('is skipped without a landscape target or for temporary packages', async () => {
        expect(await forwardDeletionTransport.filter(context({}))).toBe(false);
        expect(await forwardDeletionTransport.filter(context({ targetSystem: 'QAS', devclass: '$PKG' }))).toBe(false);
        expect(await forwardDeletionTransport.filter(context())).toBe(true);
    });

    test('marks the queue entry before forwarding can commit and throw', async () => {
        const ctx = context();
        (SystemConnector.forwardTransport as jest.Mock).mockRejectedValue(new Error('response lost'));

        await expect(execute('test', [forwardDeletionTransport], ctx)).rejects.toThrow();

        expect(ctx.revert.deleInTargetTms).toBe(true);
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9DELE', 'QAS');
    });

    test('a later failure removes the deletion transport from the target queue', async () => {
        const ctx = context();
        const failing = { name: 'fail', run: async () => { throw new Error('later failure'); } };

        await expect(execute('test', [forwardDeletionTransport, failing], ctx)).rejects.toThrow();

        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9DELE', 'QAS');
        expect(ctx.output.targetSystem).toBeUndefined();
    });

    test('revert does nothing when the transport was never forwarded', async () => {
        await forwardDeletionTransport.revert(context());

        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
    });
});
