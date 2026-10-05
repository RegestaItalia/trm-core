jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        isTransportLayerExist: jest.fn(),
        getDefaultTransportLayer: jest.fn(),
        getTransportTargets: jest.fn()
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
                installData: { installDevclass: { transportLayer: 'ZLAYER' } }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'error', 'info', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        //reaching the next system call means the integrity check passed
        (SystemConnector.isTransportLayerExist as jest.Mock).mockRejectedValue(new Error('past integrity check'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('aborts before any system change when the fetched release does not match', async () => {
        await expect(init.run(context('locked-sha'))).rejects.toThrow('Cannot continue due to security issues.');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Expected SHA is locked-sha'));
        expect(SystemConnector.isTransportLayerExist).not.toHaveBeenCalled();
    });

    test('an empty expected integrity is never accepted', async () => {
        await expect(init.run(context(''))).rejects.toThrow('Cannot continue due to security issues.');
    });

    test('continues when the fetched release matches', async () => {
        await expect(init.run(context('registry-sha'))).rejects.toThrow('past integrity check');
        expect(SystemConnector.isTransportLayerExist).toHaveBeenCalledWith('ZLAYER');
    });

    test('continues without an expected integrity', async () => {
        await expect(init.run(context())).rejects.toThrow('past integrity check');
    });

    test('no transport layer lookup happens when none is specified', async () => {
        const ctx = context();
        delete ctx.rawInput.installData.installDevclass.transportLayer;
        //the landscape target lookup follows the transport layer check
        (SystemConnector.getTransportTargets as jest.Mock).mockRejectedValue(new Error('past layer check'));
        await expect(init.run(ctx)).rejects.toThrow('past layer check');
        expect(SystemConnector.isTransportLayerExist).not.toHaveBeenCalled();
        expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
    });
});
