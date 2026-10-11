jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getObject: jest.fn(),
        executePostActivity: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { PostActivity } from './PostActivity';

describe('post activity class existence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ['loading', 'log', 'error', 'success', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a missing class does not exist', async () => {
        (SystemConnector.getObject as jest.Mock).mockResolvedValue(undefined);
        await expect(PostActivity.exists(' zcl_missing ')).resolves.toBe(false);
        expect(SystemConnector.getObject).toHaveBeenCalledWith('R3TR', 'CLAS', 'ZCL_MISSING');
    });

    test('an existing class exists', async () => {
        (SystemConnector.getObject as jest.Mock).mockResolvedValue({ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_PA' });
        await expect(PostActivity.exists('ZCL_PA')).resolves.toBe(true);
    });

    test('a failed lookup rejects', async () => {
        (SystemConnector.getObject as jest.Mock).mockRejectedValue(new Error('rfc down'));
        await expect(PostActivity.exists('ZCL_PA')).rejects.toThrow('rfc down');
    });

    test('execution stops before calling the system when the class is missing', async () => {
        (SystemConnector.getObject as jest.Mock).mockResolvedValue(undefined);
        await expect(new PostActivity({ name: 'ZCL_MISSING' }).execute()).rejects.toThrow('Class "ZCL_MISSING" doesn\'t exist.');
        expect(SystemConnector.executePostActivity).not.toHaveBeenCalled();
    });
});
