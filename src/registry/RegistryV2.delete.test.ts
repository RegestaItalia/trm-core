import { Logger } from 'trm-commons';
import { RegistryV2 } from './RegistryV2';
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

    test('any failure makes the deletion unavailable with the registry message', async () => {
        const error = Object.assign(new Error('Transport deletion requires an active Pro plan'), { status: 403 });
        post.mockRejectedValue(error);

        const rejection = registry().delete(backup);
        await expect(rejection).rejects.toBeInstanceOf(RegistryDeletionTransportUnavailableError);
        await expect(rejection).rejects.toMatchObject({ message: 'Transport deletion requires an active Pro plan', originalError: error });
    });
});
