jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDefaultTransportLayer: jest.fn()
    },
    TRM_REST_PACKAGE_NAME: 'trm-rest',
    TRM_SERVER_PACKAGE_NAME: 'trm-server'
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { init } from './init';

describe('install release integrity', () => {
    function context(integrity?: string) {
        return {
            rawInput: {
                packageData: {
                    name: 'dep',
                    version: '1.0.0',
                    integrity,
                    registry: {
                        name: 'test',
                        getRegistryType: () => 'PUBLIC',
                        getPackage: jest.fn(async () => ({
                            name: 'dep',
                            checksum: 'registry-sha',
                            manifest: { name: 'dep', version: '1.0.0' },
                            transports: []
                        }))
                    }
                },
                contextData: { systemPackages: [] },
                installData: {}
            }
        } as any;
    }

    beforeEach(() => {
        for (const method of ['loading', 'error', 'info', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        //reaching the next system call means the integrity check passed
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockRejectedValue(new Error('past integrity check'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('aborts before any system change when the fetched release does not match', async () => {
        await expect(init.run(context('locked-sha'))).rejects.toThrow('Cannot continue due to security issues.');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Expected SHA is locked-sha'));
        expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
    });

    test('an empty expected integrity is never accepted', async () => {
        await expect(init.run(context(''))).rejects.toThrow('Cannot continue due to security issues.');
    });

    test('continues when the fetched release matches', async () => {
        await expect(init.run(context('registry-sha'))).rejects.toThrow("Couldn't determine system's default transport layer.");
        expect(SystemConnector.getDefaultTransportLayer).toHaveBeenCalled();
    });

    test('continues without an expected integrity', async () => {
        await expect(init.run(context())).rejects.toThrow("Couldn't determine system's default transport layer.");
    });
});
