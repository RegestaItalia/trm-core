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

function context(targetSystem = 'QAS') {
    const transport = {
        trkorr: 'DEVK9LAND',
        release: jest.fn().mockResolvedValue(undefined),
        canBeDeleted: jest.fn().mockResolvedValue(false),
        delete: jest.fn().mockResolvedValue(undefined)
    };
    return {
        ctx: {
            rawInput: {
                packageData: { name: 'pkg' },
                contextData: { logTemporaryFolder: '/tmp/trm' },
                installData: { landscapeTransport: { targetSystem } }
            },
            runtime: { package: { data: { manifest: { version: '2.0.0' } } } },
            revert: {},
            output: { transport }
        } as any,
        transport
    };
}

describe('releaseLandscapeTransport', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
    });

    test('releases the landscape transport, and adds nothing else to any import queue', async () => {
        const { ctx, transport } = context();

        await execute('test', [releaseLandscapeTransport], ctx);

        expect(transport.release).toHaveBeenCalledWith(true, false, '/tmp/trm');
        expect(ctx.revert.landscapeReleased).toBe(true);
        expect(SystemConnector.forwardTransport).not.toHaveBeenCalled();
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
    });

    test('a failed release does not undo the install: the transport is left to release manually', async () => {
        const { ctx, transport } = context();
        transport.release.mockRejectedValue(new Error('release failed'));

        await expect(execute('test', [releaseLandscapeTransport], ctx)).resolves.toBeDefined();

        expect(ctx.revert.landscapeReleaseStarted).toBe(true);
        expect(ctx.revert.landscapeReleased).toBeUndefined();
        expect(transport.delete).not.toHaveBeenCalled();
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Release transport DEVK9LAND to QAS manually'), { important: true });
    });

    describe('rollback by a parent install (dependency)', () => {
        test('a transport not released yet is deleted', async () => {
            const { ctx, transport } = context();
            transport.canBeDeleted.mockResolvedValue(true);

            await releaseLandscapeTransport.revert(ctx);

            expect(transport.delete).toHaveBeenCalledTimes(1);
        });

        test('a released transport is removed from the queue of the connected system', async () => {
            const { ctx } = context('TST');
            ctx.revert.landscapeReleaseStarted = true;

            await releaseLandscapeTransport.revert(ctx);

            expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9LAND', 'TST');
        });

        test('a released transport queued in another system is left there with a warning', async () => {
            const { ctx } = context('QAS');
            ctx.revert.landscapeReleaseStarted = true;

            await releaseLandscapeTransport.revert(ctx);

            expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('remove it manually in STMS'), { important: true });
        });

        test('a failed status read is surfaced with a warning', async () => {
            const { ctx, transport } = context();
            ctx.revert.landscapeReleaseStarted = true;
            transport.canBeDeleted.mockRejectedValue(new Error('status read failed'));

            await expect(releaseLandscapeTransport.revert(ctx)).rejects.toThrow('status read failed');
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9LAND'), { important: true });
        });
    });
});
