jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        updateTrmPackageData: jest.fn(),
        getDest: jest.fn(() => 'TST')
    }
}));

import { SystemConnector } from '../../systemConnector';
import { updatePackageData } from './updatePackageData';

describe('publish package metadata rollback boundary', () => {
    test('propagates metadata write failure so the workflow rollback chain runs', async () => {
        const failure = new Error('metadata write failed');
        jest.spyOn(SystemConnector, 'updateTrmPackageData').mockRejectedValue(failure);
        const context = {
            rawInput: {
                packageData: { name: 'pkg', registry: { getRegistryType: () => 1 } },
                systemData: {},
                publishData: {}
            },
            runtime: {
                manifestXml: '<manifest/>',
                transports: { tadir: { trkorr: 'DEVK900001' } }
            },
            output: {
                trmArtifact: { binary: Buffer.from('artifact') }
            }
        } as any;

        await expect(updatePackageData.run(context)).rejects.toBe(failure);
    });
});
