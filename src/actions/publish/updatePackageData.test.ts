jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        updateTrmPackageData: jest.fn(),
        getDest: jest.fn(() => 'TST')
    }
}));

import { SystemConnector } from '../../systemConnector';
import { updatePackageData } from './updatePackageData';
import { Logger } from 'trm-commons';

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
                trmArtifact: { binary: Buffer.from('artifact') }
            }
        } as any;

        await expect(updatePackageData.run(context)).resolves.toBeUndefined();
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('pkg v1.2.3 has been published'));
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Install pkg v1.2.3 on TST'));
        expect(logError).toHaveBeenCalledWith('Error: metadata write failed', true);
    });
});
