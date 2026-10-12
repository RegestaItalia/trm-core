jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getTransportTargets: jest.fn(),
        getDest: jest.fn(() => 'DEV'),
        getLogonUser: jest.fn(() => 'TESTER'),
        getInstallPackages: jest.fn(),
        getInstallTransports: jest.fn()
    },
    TRM_REST_PACKAGE_NAME: 'trm-rest',
    TRM_SERVER_PACKAGE_NAME: 'trm-server'
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { RegistryType } from '../../registry';
import { Manifest } from '../../manifest';
import { init } from './init';

describe('install init of a trm-server/trm-rest upgrade', () => {
    function context(name: string, installedVersion: string, version: string, legacyBackend: boolean) {
        return {
            legacyBackend,
            rawInput: {
                packageData: {
                    name,
                    version,
                    registry: {
                        name: 'public',
                        endpoint: 'public',
                        getRegistryType: () => RegistryType.PUBLIC,
                        getPackage: jest.fn(async () => ({
                            name,
                            checksum: 'sha',
                            manifest: { name, version },
                            transports: []
                        }))
                    }
                },
                contextData: {
                    noInquirer: true,
                    systemPackages: [{
                        packageName: name,
                        manifest: new Manifest({ name, version: installedVersion }),
                        getDirtyEntries: () => []
                    }]
                }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'error', 'info', 'log', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getTransportTargets as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getInstallPackages as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getInstallTransports as jest.Mock).mockResolvedValue([]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a legacy backend has no install transports to read', async () => {
        const ctx = context('trm-server', '6.4.1', '7.0.0', true);
        await init.run(ctx);
        expect(ctx.runtime.selfUpdate).toBe(true);
        expect(SystemConnector.getInstallPackages).toHaveBeenCalled();
        expect(SystemConnector.getInstallTransports).not.toHaveBeenCalled();
    });

    test('trm-server 7 warns that users need ZTRM_AUTH', async () => {
        await init.run(context('trm-server', '6.4.1', '7.0.0', true));
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('ZTRM_AUTH (ACTVT 16) instead of table /ATRM/USERS: TESTER'), { important: true });
    });

    test('an upgrade within trm-server 7 reads its install transports and has no authorization warning', async () => {
        const ctx = context('trm-server', '7.0.0', '7.1.0', false);
        await init.run(ctx);
        expect(ctx.runtime.selfUpdate).toBe(true);
        expect(SystemConnector.getInstallTransports).toHaveBeenCalled();
        expect(Logger.warning).not.toHaveBeenCalledWith(expect.stringContaining('ZTRM_AUTH'), expect.anything());
    });

    test('trm-rest is a self-update too', async () => {
        const ctx = context('trm-rest', '5.0.0', '6.0.0', true);
        await init.run(ctx);
        expect(ctx.runtime.selfUpdate).toBe(true);
        expect(Logger.warning).not.toHaveBeenCalledWith(expect.stringContaining('ZTRM_AUTH'), expect.anything());
    });

    test('other packages are not self-updates', async () => {
        const ctx = context('pkg', '1.0.0', '2.0.0', false);
        await init.run(ctx);
        expect(ctx.runtime.selfUpdate).toBe(false);
    });
});
