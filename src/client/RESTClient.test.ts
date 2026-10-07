import { RESTClient } from './RESTClient';

describe('RESTClient deleteTmsTransport', () => {
    it('normalizes the transport and the target system like forwardTransport', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const del = jest.fn().mockResolvedValue({});
        (client as any)._axiosInstance = { delete: del };

        await client.deleteTmsTransport(' devk9dele ', 'qas ');

        expect(del).toHaveBeenCalledWith('/delete_tms_transport', { data: { trkorr: 'DEVK9DELE', system: 'QAS' } });
    });
});
