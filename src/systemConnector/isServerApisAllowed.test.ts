jest.mock('trm-commons', () => ({
    ...jest.requireActual('trm-commons'),
    Logger: {
        loading: jest.fn(),
        success: jest.fn(),
        log: jest.fn(),
        warning: jest.fn(),
        error: jest.fn()
    }
}));

import { RESTClient, RESTClientError, RFCClient, RFCClientError } from '../client';
import { RESTSystemConnector } from './RESTSystemConnector';
import { RFCSystemConnector } from './RFCSystemConnector';

const sapMessage = { class: '/ATRM/MSG', no: '001' };

describe.each([
    ['REST', RESTSystemConnector, () => new RESTClientError('TRM_UNAUTHORIZED', sapMessage, undefined, 'denied')],
    ['RFC', RFCSystemConnector, () => new RFCClientError('TRM_RFC_UNAUTHORIZED', sapMessage, undefined, 'denied')]
] as const)('%s connector isServerApisAllowed', (_name, Connector, denial) => {
    function connector(isServerApisAllowed: jest.Mock) {
        const instance = Object.create((Connector as any).prototype);
        instance._client = { isServerApisAllowed };
        return instance as RESTSystemConnector | RFCSystemConnector;
    }

    test('caches a granted authorization', async () => {
        const check = jest.fn().mockResolvedValue(true);
        const instance = connector(check);

        await expect(instance.isServerApisAllowed()).resolves.toBe(true);
        await expect(instance.isServerApisAllowed()).resolves.toBe(true);

        expect(check).toHaveBeenCalledTimes(1);
    });

    test('does not cache a denial', async () => {
        const error = denial();
        const check = jest.fn().mockResolvedValueOnce(error).mockResolvedValueOnce(true);
        const instance = connector(check);

        await expect(instance.isServerApisAllowed()).resolves.toBe(error);
        await expect(instance.isServerApisAllowed()).resolves.toBe(true);

        expect(check).toHaveBeenCalledTimes(2);
    });

    test('propagates, without caching, a failure of the check', async () => {
        const check = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(true);
        const instance = connector(check);

        await expect(instance.isServerApisAllowed()).rejects.toThrow('timeout');
        await expect(instance.isServerApisAllowed()).resolves.toBe(true);

        expect(check).toHaveBeenCalledTimes(2);
    });
});

describe('RESTClient isServerApisAllowed', () => {
    function client(post: jest.Mock): RESTClient {
        const instance = Object.create(RESTClient.prototype);
        instance._axiosInstance = { post };
        return instance;
    }

    test('returns true when the check succeeds', async () => {
        await expect(client(jest.fn().mockResolvedValue({ data: {} })).isServerApisAllowed()).resolves.toBe(true);
    });

    test('returns a SAP denial', async () => {
        const error = new RESTClientError('TRM_UNAUTHORIZED', sapMessage, undefined, 'denied');

        await expect(client(jest.fn().mockRejectedValue(error)).isServerApisAllowed()).resolves.toBe(error);
    });

    test('rethrows errors without a SAP message, such as timeouts or a bare HTTP 403', async () => {
        const error = Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } });

        await expect(client(jest.fn().mockRejectedValue(error)).isServerApisAllowed()).rejects.toBe(error);
    });
});

describe('RFCClient isServerApisAllowed', () => {
    function client(call: jest.Mock): RFCClient {
        const instance = Object.create(RFCClient.prototype);
        instance._call = call;
        return instance;
    }

    test('returns true when the check succeeds', async () => {
        await expect(client(jest.fn().mockResolvedValue({})).isServerApisAllowed()).resolves.toBe(true);
    });

    test('returns a SAP denial', async () => {
        const error = new RFCClientError('TRM_RFC_UNAUTHORIZED', sapMessage, undefined, 'denied');

        await expect(client(jest.fn().mockRejectedValue(error)).isServerApisAllowed()).resolves.toBe(error);
    });

    test('rethrows errors that are not SAP errors', async () => {
        const error = new Error('library not loaded');

        await expect(client(jest.fn().mockRejectedValue(error)).isServerApisAllowed()).rejects.toBe(error);
    });
});
