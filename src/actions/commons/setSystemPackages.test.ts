jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getInstalledPackages: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { setSystemPackages } from './setSystemPackages';

describe('set-system-packages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('reads a fresh snapshot including local-registry packages', async () => {
        const packages = [{ packageName: 'remote' }, { packageName: 'local' }];
        (SystemConnector.getInstalledPackages as jest.Mock).mockResolvedValue(packages);
        const context = { rawInput: {} } as any;

        await setSystemPackages.run(context);

        expect(SystemConnector.getInstalledPackages).toHaveBeenCalledWith(true, true);
        expect(context.rawInput.contextData.systemPackages).toBe(packages);
    });

    test('keeps a caller-supplied snapshot', async () => {
        const packages = [];
        const context = { rawInput: { contextData: { systemPackages: packages } } } as any;

        await setSystemPackages.run(context);

        expect(SystemConnector.getInstalledPackages).not.toHaveBeenCalled();
        expect(context.rawInput.contextData.systemPackages).toBe(packages);
    });
});
