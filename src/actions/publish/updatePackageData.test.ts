jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        updateTrmPackageData: jest.fn(),
        getDest: jest.fn(() => 'TST')
    }
}));

import { SystemConnector } from '../../systemConnector';
import { updatePackageData } from './updatePackageData';
import { Logger } from 'trm-commons';
import { createHash } from 'crypto';

function context(publishedIntegrity?: string) {
    return {
        rawInput: {
            packageData: { name: 'pkg', registry: { getRegistryType: () => 1, endpoint: 'http://localhost' } },
            systemData: {},
            publishData: {}
        },
        runtime: {
            manifest: { version: '1.2.3' },
            manifestXml: '<manifest/>',
            transports: { tadir: { trkorr: 'DEVK900001' } }
        },
        output: {
            trmPackage: { getPublishedIntegrity: () => publishedIntegrity },
            trmArtifact: { binary: Buffer.from('artifact') }
        }
    } as any;
}

describe('publish package metadata synchronization', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('preserves publication success and reports how to repair a metadata write failure', async () => {
        const failure = new Error('metadata write failed');
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(failure);
        const logError = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
        const context = {
            rawInput: {
                packageData: { name: 'pkg', registry: { getRegistryType: () => 1 } },
                systemData: {},
                publishData: {}
            },
            runtime: {
                manifest: { version: '1.2.3' },
                manifestXml: '<manifest/>',
                transports: { tadir: { trkorr: 'DEVK900001' } }
            },
            output: {
                trmPackage: { getPublishedIntegrity: () => undefined },
                trmArtifact: { binary: Buffer.from('artifact') }
            }
        } as any;

        await expect(updatePackageData.run(context)).resolves.toBeUndefined();
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('pkg v1.2.3 has been published'));
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Install pkg v1.2.3 on TST'));
        expect(logError).toHaveBeenCalledWith('Error: metadata write failed', true);
    });

    test('stores the integrity reported by the registry', async () => {
        const update = jest.spyOn(SystemConnector, 'updateTrmPackageData').mockResolvedValue(undefined);

        await updatePackageData.run(context('registry-sha'));

        expect(update).toHaveBeenCalledWith(expect.objectContaining({ integrity: 'registry-sha' }));
    });

    test('falls back to the local artifact integrity', async () => {
        const update = jest.spyOn(SystemConnector, 'updateTrmPackageData').mockResolvedValue(undefined);

        await updatePackageData.run(context());

        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            integrity: createHash('sha512').update(Buffer.from('artifact')).digest('base64')
        }));
    });
});
