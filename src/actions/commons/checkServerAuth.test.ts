import { SystemConnector } from '../../systemConnector';
import { ClientError } from '../../client';
import { checkServerAuth } from './checkServerAuth';

describe('checkServerAuth', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('passes when the server APIs are allowed', async () => {
        jest.spyOn(SystemConnector, 'isServerApisAllowed').mockResolvedValue(true);

        await expect(checkServerAuth.run({})).resolves.toBeUndefined();
    });

    test('throws the denial', async () => {
        const denial = new ClientError('TRM_UNAUTHORIZED', { class: '/ATRM/MSG', no: '001' }, 'denied');
        jest.spyOn(SystemConnector, 'isServerApisAllowed').mockResolvedValue(denial);

        await expect(checkServerAuth.run({})).rejects.toBe(denial);
    });

    test('fails closed on any other result', async () => {
        jest.spyOn(SystemConnector, 'isServerApisAllowed').mockResolvedValue(undefined as any);

        await expect(checkServerAuth.run({})).rejects.toThrow('TRM server APIs authorization check failed.');
    });

    test('fails closed when the check itself fails', async () => {
        jest.spyOn(SystemConnector, 'isServerApisAllowed').mockRejectedValue(new Error('timeout'));

        await expect(checkServerAuth.run({})).rejects.toThrow('timeout');
    });
});
