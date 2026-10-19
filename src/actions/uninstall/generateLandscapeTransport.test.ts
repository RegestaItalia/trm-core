jest.mock('../../systemConnector', () => ({
    SystemConnector: { getDest: jest.fn(() => 'DEV'), deleteTmsTransport: jest.fn() }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static createWb = jest.fn();
        static getTransportIcon = jest.fn(() => 'TR');
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { Transport } from '../../transport';
import { generateLandscapeTransport, releaseLandscapeTransport } from './generateLandscapeTransport';

function context(extra: any = {}) {
    return {
        rawInput: { packageData: { name: 'pkg' }, uninstallData: { landscapeTransport: { targetSystem: 'QAS' } }, ...extra },
        runtime: { update: { manifest: { get: () => ({ name: 'pkg', version: '1.0.0' }) } } },
        revert: {},
        output: { deletions: [{ trkorr: 'DEVK9NESTED' }, { trkorr: 'DEVK9DELE' }] }
    } as any;
}

describe('uninstall landscape transport', () => {
    let landscape: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        landscape = {
            trkorr: 'DEVK9LAND',
            addObjectsFromTransport: jest.fn(),
            removeComments: jest.fn(),
            addComment: jest.fn(),
            release: jest.fn(),
            canBeDeleted: jest.fn().mockResolvedValue(true),
            delete: jest.fn()
        };
        (Transport.createWb as jest.Mock).mockResolvedValue(landscape);
    });

    test('copies every imported deletion (nested uninstalls included) into one transport released to the target', async () => {
        const ctx = context();

        await execute('test', [generateLandscapeTransport, releaseLandscapeTransport], ctx);

        expect(Transport.createWb).toHaveBeenCalledWith({ text: '@X1@TRM (DELE) pkg 1.0.0', target: 'QAS' });
        expect(landscape.addObjectsFromTransport.mock.calls.map((call: any[]) => call[0])).toEqual(['DEVK9NESTED', 'DEVK9DELE']);
        expect(landscape.release).toHaveBeenCalled();
        expect(ctx.output.landscapeTransport).toBe(landscape);
        expect(ctx.output.targetSystem).toBe('QAS');
    });

    test('a nested uninstall leaves its deletions to the landscape transport of its parent', async () => {
        const ctx = context({ nested: true });

        await execute('test', [generateLandscapeTransport, releaseLandscapeTransport], ctx);

        expect(Transport.createWb).not.toHaveBeenCalled();
    });

    test('nothing deleted, or no target: no landscape transport', async () => {
        const nothing = context();
        nothing.output.deletions = [];
        await expect(generateLandscapeTransport.filter(nothing)).resolves.toBe(false);

        const final = context();
        final.rawInput.uninstallData.landscapeTransport.targetSystem = undefined;
        await expect(generateLandscapeTransport.filter(final)).resolves.toBe(false);
    });

    test('a failed release does not undo the uninstall', async () => {
        const ctx = context();
        landscape.release.mockRejectedValue(new Error('release failed'));

        await execute('test', [generateLandscapeTransport, releaseLandscapeTransport], ctx);

        expect(landscape.delete).not.toHaveBeenCalled();
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('pkg is uninstalled from DEV. Release transport DEVK9LAND to QAS manually'), { important: true });
    });

    test('a failure while copying deletes the landscape transport', async () => {
        const ctx = context();
        landscape.addObjectsFromTransport.mockRejectedValueOnce(new Error('copy failed'));

        await expect(execute('test', [generateLandscapeTransport], ctx)).rejects.toThrow();

        expect(landscape.delete).toHaveBeenCalled();
        expect(ctx.output.landscapeTransport).toBeUndefined();
    });
});
