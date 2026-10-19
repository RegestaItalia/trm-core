jest.mock('../../../systemConnector', () => ({
    SystemConnector: {
        getTrmServerPackage: jest.fn(),
        getTrmRestPackage: jest.fn()
    },
    TRM_REST_PACKAGE_NAME: 'trm-rest',
    TRM_SERVER_PACKAGE_NAME: 'trm-server'
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../../systemConnector';
import { RegistryType } from '../../../registry';
import { getMissingTrmBackendApis, isTrmBackendPackage, lacksTrmBackendApis } from './trmBackend';

const installed = (version: string) => ({ manifest: { get: () => ({ version }) } });

describe('TRM backend generation', () => {
    beforeEach(() => {
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
    });

    test.each([
        ['6.4.1', '5.0.0', ['trmServer7', 'trmServer8']],
        ['7.0.0', '5.0.0', ['trmServer7', 'trmServer8']],
        ['6.4.1', undefined, ['trmServer7', 'trmServer8']],
        ['7.0.1', '6.0.0', ['trmServer8']],
        ['7.0.1', undefined, ['trmServer8']],
        ['8.0.0', '6.0.0', ['trmServer8']],
        ['8.0.0', '7.0.0', []],
        ['8.0.0', undefined, []]
    ])('trm-server %s, trm-rest %s: missing %j', async (server, rest, missing) => {
        (SystemConnector.getTrmServerPackage as jest.Mock).mockResolvedValue(installed(server));
        if (rest) {
            (SystemConnector.getTrmRestPackage as jest.Mock).mockResolvedValue(installed(rest));
        } else {
            (SystemConnector.getTrmRestPackage as jest.Mock).mockRejectedValue(new Error('Package trm-rest was not found.'));
        }
        await expect(getMissingTrmBackendApis()).resolves.toEqual(missing);
    });

    test('only the listed generations are lacking, and none outside a backend upgrade', () => {
        expect(lacksTrmBackendApis({ missingBackendApis: ['trmServer8'] }, 'trmServer8')).toBe(true);
        expect(lacksTrmBackendApis({ missingBackendApis: ['trmServer8'] }, 'trmServer7')).toBe(false);
        expect(lacksTrmBackendApis({}, 'trmServer8')).toBe(false);
    });

    test('only the public trm-server and trm-rest are the TRM backend', () => {
        const registry = (type: RegistryType) => ({ getRegistryType: () => type }) as any;
        expect(isTrmBackendPackage(registry(RegistryType.PUBLIC), 'TRM-SERVER')).toBe(true);
        expect(isTrmBackendPackage(registry(RegistryType.PUBLIC), 'trm-rest')).toBe(true);
        expect(isTrmBackendPackage(registry(RegistryType.PRIVATE), 'trm-server')).toBe(false);
        expect(isTrmBackendPackage(registry(RegistryType.PUBLIC), 'pkg')).toBe(false);
    });
});
