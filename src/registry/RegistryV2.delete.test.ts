import { Logger } from 'trm-commons';
import { RegistryV2 } from './RegistryV2';
import { RegistryDeletionTransportUnauthorizedError } from './RegistryDeletionTransportUnauthorizedError';
import { RegistryDeletionTransportUnavailableError } from './RegistryDeletionTransportUnavailableError';

describe('registry deletion transport', () => {
    const backup = { header: Buffer.from('h'), data: Buffer.from('d') };
    let post: jest.Mock;
    let get: jest.Mock;

    function registry(): RegistryV2 {
        const registry = new RegistryV2('http://localhost/registry', 'test');
        (registry as any)._axiosInstance = { post, get };
        return registry;
    }

    function httpError(status: number) {
        return Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } });
    }

    function sentOptions(): any {
        const form = post.mock.calls[0][1];
        const body = form.getBuffer().toString();
        const match = body.match(/name="options"\r\n\r\n(.*)\r\n/);
        return match ? JSON.parse(match[1]) : undefined;
    }

    beforeEach(() => {
        post = jest.fn();
        get = jest.fn();
        for (const method of ['log', 'error', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('without options only the transport is sent', async () => {
        post.mockResolvedValue({ status: 200, data: { empty: true } });

        await expect(registry().delete(backup)).resolves.toEqual({ empty: true, deleted: undefined });
        expect(sentOptions()).toBeUndefined();
    });

    test('options are sent and an empty deletion has no binaries', async () => {
        post.mockResolvedValue({ status: 200, data: { empty: true, deleted: { e071: [], e071k: [] } } });
        const options = { target: 'TSTK900010', subtract: ['TRMK000001'], exclude: { e071: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZKEEP' }] } };

        await expect(registry().delete(backup, options)).resolves.toEqual({ empty: true, deleted: { e071: [], e071k: [] } });
        expect(sentOptions()).toEqual(options);
    });

    test('the deletion transport is downloaded with what it deletes', async () => {
        post.mockResolvedValue({ status: 200, data: { download_link: 'http://dl', checksum: 'x', deleted: { e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OLD' }] } } });
        const binaries = { header: Buffer.from('k'), data: Buffer.from('r') };
        const download = jest.spyOn(RegistryV2.prototype as any, 'downloadTransport').mockResolvedValue(binaries);

        await expect(registry().delete(backup, { target: 'TSTK900010' })).resolves.toEqual({
            empty: false,
            binaries,
            deleted: { e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OLD' }], e071k: [] }
        });
        expect(download).toHaveBeenCalledWith(expect.objectContaining({ download_link: 'http://dl' }), 'deletion transport');
    });

    test.each([401, 403])('HTTP %s is an unauthorized deletion', async status => {
        post.mockRejectedValue(httpError(status));

        await expect(registry().delete(backup)).rejects.toBeInstanceOf(RegistryDeletionTransportUnauthorizedError);
    });

    test.each([400, 404])('with options, HTTP %s makes the deletion unavailable (older registry, unknown release)', async status => {
        post.mockRejectedValue(httpError(status));

        await expect(registry().delete(backup, { target: 'TSTK900010' })).rejects.toBeInstanceOf(RegistryDeletionTransportUnavailableError);
    });

    test('without options, other errors are rethrown', async () => {
        const error = httpError(400);
        post.mockRejectedValue(error);

        await expect(registry().delete(backup)).rejects.toBe(error);
    });
});
