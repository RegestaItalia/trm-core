jest.mock('../../../systemConnector', () => ({
    SystemConnector: {
        getTransportTargets: jest.fn(),
        getDest: jest.fn(() => 'DEV')
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../../systemConnector';
import { setPublishTarget } from './setPublishTarget';

describe('setPublishTarget', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'info').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('uses the system itself when it has no transport targets', async () => {
        (SystemConnector.getTransportTargets as jest.Mock).mockResolvedValue([]);

        await expect(setPublishTarget(true, undefined, 'Publish transport target')).resolves.toBe('DEV');
    });

    test('accepts the system itself as explicit target when it has no transport targets', async () => {
        (SystemConnector.getTransportTargets as jest.Mock).mockResolvedValue([]);

        await expect(setPublishTarget(true, 'dev', 'Publish transport target')).resolves.toBe('DEV');
        await expect(setPublishTarget(true, 'QAS', 'Publish transport target')).rejects.toThrow('Transport target QAS does not exist.');
    });

    test('uses the system targets when there are any', async () => {
        (SystemConnector.getTransportTargets as jest.Mock).mockResolvedValue(['QAS']);

        await expect(setPublishTarget(true, undefined, 'Publish transport target')).resolves.toBe('QAS');
        await expect(setPublishTarget(true, 'DEV', 'Publish transport target')).rejects.toThrow('Transport target DEV does not exist.');
    });
});
