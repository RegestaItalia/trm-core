import { RESTClient } from './RESTClient';
import { RESTClientError } from './RESTClientError';

describe('RESTClient deleteTmsTransport', () => {
    it('normalizes the transport and the target system like forwardTransport', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const del = jest.fn().mockResolvedValue({});
        (client as any)._axiosInstance = { delete: del };

        await client.deleteTmsTransport(' devk9dele ', 'qas ');

        expect(del).toHaveBeenCalledWith('/delete_tms_transport', { data: { trkorr: 'DEVK9DELE', system: 'QAS' } });
    });
});

describe('RESTClient deleteTemporaryPackage', () => {
    it('calls the trm-rest method that exists, otherwise the server answers METHOD_CALL_EXCEPTION', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const del = jest.fn().mockResolvedValue({});
        (client as any)._axiosInstance = { delete: del };

        await client.deleteTemporaryPackage(' $local ');

        expect(del).toHaveBeenCalledWith('/delete_tmp_package', { data: { devclass: '$LOCAL' } });
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

describe('RESTClient SAP errors without a message', () => {
    it('report the exception reason instead of an unreadable message', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        let onError: (error: any) => Promise<any>;
        const getMessage = jest.spyOn(client, 'getMessage');
        (client as any)._axiosInstance = {
            get: jest.fn().mockResolvedValue({ status: 200 }),
            interceptors: { response: { use: jest.fn((_ok, ko) => { onError = ko; }) } }
        };
        (client as any).endpoint = 'http://sap';
        await client.open();

        const error = await onError({
            response: { status: 500, statusText: 'METHOD_CALL_EXCEPTION', data: { message: { msgid: '', msgno: '000', msgv1: '', msgv2: '', msgv3: '', msgv4: '' } } }
        }).catch(e => e);

        expect(error.message).toBe('SAP error METHOD_CALL_EXCEPTION (no message)');
        expect(getMessage).not.toHaveBeenCalled();
    });
});

describe('RESTClient getTransportLayers', () => {
    it('sends the target in the body, like the other GET methods trm-rest reads JSON from', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const get = jest.fn().mockResolvedValue({ data: { layers: ['SAP ', 'ZQAS'] } });
        (client as any)._axiosInstance = { get };

        await expect(client.getTransportLayers(' qas ')).resolves.toEqual(['SAP', 'ZQAS']);

        expect(get).toHaveBeenCalledWith('/get_transport_layers', { data: { target: 'QAS' } });
    });
});

describe('RESTClient action log', () => {
    it('posts the action log to the trm-rest methods with the RFC field names', async () => {
        const client = Object.create(RESTClient.prototype) as RESTClient;
        const post = jest.fn().mockResolvedValue({});
        (client as any)._axiosInstance = { post };

        await client.logActionStart({ actionId: 'A'.repeat(32), sessionId: 'session', actionName: 'install', parentActionId: 'B'.repeat(32), packageName: 'pkg', packageRegistry: 'public', version: 'latest' });
        await client.logTransportEvents('A'.repeat(32), [{ trkorr: 'TRMK900001', event: 'IMPORT', role: 'TADIR', target: 'TST', retcode: 4 }, { trkorr: 'TRMK900002', event: 'CREATE' }]);
        await client.logActionEnd('A'.repeat(32), 'B', '1.2.3');

        expect(post.mock.calls).toEqual([
            ['/log_action_start', { action_id: 'A'.repeat(32), session_id: 'session', parent_action_id: 'B'.repeat(32), action_name: 'install', package_name: 'pkg', package_registry: 'public', version: 'latest' }],
            ['/log_tr_events', { action_id: 'A'.repeat(32), events: [
                { trkorr: 'TRMK900001', role: 'TADIR', event: 'IMPORT', target: 'TST', retcode: '0004' },
                { trkorr: 'TRMK900002', role: '', event: 'CREATE', target: '', retcode: '' }
            ] }],
            ['/log_action_end', { action_id: 'A'.repeat(32), status: 'B', version: '1.2.3' }]
        ]);
    });
});

describe('RESTClient system info', () => {
    function client(get: jest.Mock) {
        const instance = Object.create(RESTClient.prototype) as RESTClient;
        (instance as any)._axiosInstance = { get };
        instance.rfcdest = 'NONE';
        return instance;
    }

    it('reads the system ID, database and kernel of the RFC destination', async () => {
        const get = jest.fn().mockResolvedValue({ data: { dest: 'A4H', dbSystem: 'HDB', kernelRelease: ' 793 ' } });

        await expect(client(get).getSystemRuntimeInfo()).resolves.toEqual({ dest: 'A4H', dbSystem: 'HDB', kernelRelease: '793' });
        expect(get).toHaveBeenCalledWith('/get_system_info', { params: { rfcdest: 'NONE' } });
    });

    it('reads the system ID from trm-rest', async () => {
        const get = jest.fn().mockResolvedValue({ data: { dest: 'A4H' } });

        await expect(client(get).getDest()).resolves.toBe('A4H');
        expect(get.mock.calls.map(c => c[0])).toEqual(['/get_dest']);
    });

    it('falls back to the system info when not authorized', async () => {
        const get = jest.fn()
            .mockRejectedValueOnce(new RESTClientError('TRM_RFC_UNAUTHORIZED', { class: undefined, no: undefined }, null))
            .mockResolvedValueOnce({ data: { dest: 'A4H', dbSystem: 'HDB', kernelRelease: '793' } });

        await expect(client(get).getDest()).resolves.toBe('A4H');
        expect(get.mock.calls.map(c => c[0])).toEqual(['/get_dest', '/get_system_info']);
    });

    it('does not fall back on other errors', async () => {
        const get = jest.fn().mockRejectedValue(new RESTClientError('METHOD_CALL_EXCEPTION', { class: undefined, no: undefined }, null));

        await expect(client(get).getDest()).rejects.toBeInstanceOf(RESTClientError);
        expect(get.mock.calls.map(c => c[0])).toEqual(['/get_dest']);
    });
});
