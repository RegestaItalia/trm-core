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

describe('RESTClient getExistingObjectsBulk', () => {
    it('sends the object names as TADIR OBJ_NAME, otherwise the server matches nothing', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const tadir = [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG', devclass: 'ZPKG' }];
        const get = jest.fn().mockResolvedValue({ data: { tadir } });
        (client as any)._axiosInstance = { get };

        await expect(client.getExistingObjectsBulk([{ pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG', devclass: '' }])).resolves.toEqual(tadir);

        expect(get).toHaveBeenCalledWith('/get_existing_objs_bulk', {
            data: { objects: [{ pgmid: 'R3TR', object: 'PROG', obj_name: 'ZPROG' }] }
        });
    });
});

describe('RESTClient restoreInstallMetadata', () => {
    it('sends the manifest as base64, otherwise the restored row has no manifest', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const put = jest.fn().mockResolvedValue({});
        (client as any)._axiosInstance = { put };
        const row = { package_name: 'pkg', package_registry: 'public', manifest: Buffer.from('<xml/>', 'utf8'), trkorr: 'DEVK900001', integrity: 'sha', devclass: 'ZPKG' };

        await client.restoreInstallMetadata({ package: row, packageExists: true, installDevc: [] });

        expect(put).toHaveBeenCalledWith('/set_install_devc', {
            package: { ...row, manifest: Buffer.from('<xml/>', 'utf8').toString('base64') },
            package_exists: 'X',
            installdevc: [],
            installtr: []
        });
    });
});
