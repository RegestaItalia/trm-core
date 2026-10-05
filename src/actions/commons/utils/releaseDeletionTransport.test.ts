jest.mock('../../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST')
    }
}));

jest.mock('../../../transport', () => ({
    Transport: class MockTransport {
        static upload = jest.fn();
    }
}));

import { Logger } from 'trm-commons';
import { RegistryType } from '../../../registry';
import { Transport } from '../../../transport';
import { releaseDeletionTransport } from './releaseDeletionTransport';

describe('releaseDeletionTransport registry', () => {
    const toc = { header: Buffer.from('h'), data: Buffer.from('d') };
    const dele = { header: Buffer.from('dh'), data: Buffer.from('dd') };

    function deletionTransport() {
        return {
            trkorr: 'DEVK9DELE',
            release: jest.fn().mockResolvedValue(undefined),
            download: jest.fn().mockResolvedValue({ binaries: toc }),
            delete: jest.fn().mockResolvedValue(undefined)
        } as any;
    }

    function cleanupContext() {
        return { rawInput: { packageData: { name: 'pkg', registry: undefined } }, runtime: {}, revert: {} } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'success'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (Transport.upload as jest.Mock).mockResolvedValue({ import: jest.fn().mockResolvedValue(0) });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a remote registry generates the deletion transport itself', async () => {
        const registry = { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn().mockResolvedValue(dele) } as any;

        await releaseDeletionTransport(deletionTransport(), registry, cleanupContext());

        expect(registry.delete).toHaveBeenCalledWith(toc);
        expect(Transport.upload).toHaveBeenCalledWith('DEVK9DELE', expect.objectContaining({ binary: dele }));
    });

    test('a local artifact generates it through the registry it was published to', async () => {
        const realRegistry = { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn().mockResolvedValue(dele) };
        const fileRegistry = {
            getRegistryType: () => RegistryType.LOCAL,
            getRealRegistry: jest.fn().mockResolvedValue(realRegistry),
            delete: jest.fn().mockRejectedValue(new Error("File system can't generate deletion transports!"))
        } as any;

        await releaseDeletionTransport(deletionTransport(), fileRegistry, cleanupContext());

        expect(fileRegistry.delete).not.toHaveBeenCalled();
        expect(realRegistry.delete).toHaveBeenCalledWith(toc);
        expect(Transport.upload).toHaveBeenCalledWith('DEVK9DELE', expect.objectContaining({ binary: dele }));
    });

    test('an unreadable local artifact fails before the transport is released', async () => {
        const transport = deletionTransport();
        const fileRegistry = {
            getRegistryType: () => RegistryType.LOCAL,
            getRealRegistry: jest.fn().mockRejectedValue(new Error("File system couldn't read package"))
        } as any;
        const ctx = cleanupContext();

        await expect(releaseDeletionTransport(transport, fileRegistry, ctx)).rejects.toThrow("File system couldn't read package");

        expect(transport.release).not.toHaveBeenCalled();
        expect(ctx.revert.dele).toBeUndefined();
    });
});
