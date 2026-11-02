import { Logger } from 'trm-commons';
import { RegistryV2 } from './RegistryV2';
import { RegistryDiffError } from './RegistryDiffError';
import { FileSystem } from './FileSystem';

const report = {
    format: 'trm.transport-log-diff',
    version: 2,
    summary: { objects: { modified: 1 }, changedEntries: 1 },
    objects: [{ id: 'R3TR/CLAS/ZCL_A', type: 'CLAS', name: 'ZCL_A', status: 'modified', entryIds: ['e'] }],
    entries: [{ id: 'e', objectId: 'R3TR/CLAS/ZCL_A', kind: 'source', name: 'methods/RUN.abap', status: 'modified', hunks: [] }]
};

const progress = (step: number, data?: Record<string, unknown>) => ({
    progress_pool_url: 'https://registry.example/status/diff/1', steps: 3, current_step: step,
    current_step_message: `step ${step}`, ...(data ? { data } : {})
});

const registryError = (status: number, message: string, code?: string) =>
    Object.assign(new Error(message), { status, response: { message, ...(code ? { code } : {}) } });

describe('registry release diff', () => {
    let get: jest.Mock;

    function registry(): RegistryV2 {
        const registry = new RegistryV2('http://localhost/registry', 'test');
        (registry as any)._axiosInstance = { get };
        return registry;
    }

    beforeEach(() => {
        get = jest.fn();
        for (const method of ['log', 'error', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a computed diff is returned directly', async () => {
        get.mockResolvedValue({ status: 200, data: report, headers: {} });

        await expect(registry().diff('trm-server', '7.0.2', '8.0.0')).resolves.toEqual(report);
        expect(get).toHaveBeenCalledWith('/diff/trm-server', expect.objectContaining({ params: { from: '7.0.2', to: '8.0.0' } }));
    });

    test('a pending diff is polled until done, then downloaded from diff_url', async () => {
        get.mockResolvedValueOnce({ status: 202, data: progress(0), headers: { 'retry-after': '1' } })
            .mockResolvedValueOnce({ data: progress(2) })
            .mockResolvedValueOnce({ data: progress(3, { diff_url: 'https://registry.example/registry/diff/trm-server?from=1&to=2' }) })
            .mockResolvedValueOnce({ status: 200, data: report, headers: {} });
        const onProgress = jest.fn();

        const result = registry().diff('trm-server', '1', '2', { onProgress, pollIntervalMs: 1 });
        await expect(result).resolves.toEqual(report);
        expect(onProgress.mock.calls.map(([p]) => p.step)).toEqual([0, 2, 3]);
        expect(get).toHaveBeenNthCalledWith(2, 'https://registry.example/status/diff/1');
        expect(get).toHaveBeenLastCalledWith('https://registry.example/registry/diff/trm-server?from=1&to=2', expect.anything());
    });

    test('a failure reported while polling is an error with the registry code', async () => {
        get.mockResolvedValueOnce({ status: 202, data: progress(0), headers: {} })
            .mockResolvedValueOnce({ data: progress(1, { error: 'Diff too large', code: 'diff_too_large' }) });

        await expect(registry().diff('pkg', '1', '2', { pollIntervalMs: 1 })).rejects.toMatchObject({ code: 'diff_too_large', status: 422 });
    });

    test('transient polling failures are tolerated', async () => {
        get.mockResolvedValueOnce({ status: 202, data: progress(0), headers: {} })
            .mockRejectedValueOnce(new Error('socket hang up'))
            .mockResolvedValueOnce({ data: progress(3) })
            .mockResolvedValueOnce({ status: 200, data: report, headers: {} });

        await expect(registry().diff('pkg', '1', '2', { pollIntervalMs: 1 })).resolves.toEqual(report);
        expect(get).toHaveBeenLastCalledWith('/diff/pkg', expect.objectContaining({ params: { from: '1', to: '2' } }));
    });

    test('registry refusals keep their status and code', async () => {
        get.mockRejectedValueOnce(registryError(402, 'Comparing releases requires an active Pro plan', 'PRO_PLAN_REQUIRED'));
        const pro = await registry().diff('pkg', '1', '2').catch(e => e);
        expect(pro).toBeInstanceOf(RegistryDiffError);
        expect(pro).toMatchObject({ status: 402, code: 'PRO_PLAN_REQUIRED', message: 'Comparing releases requires an active Pro plan' });
        expect(pro.proPlanRequired).toBe(true);

        get.mockRejectedValueOnce(registryError(501, 'Not Implemented'));
        const unsupported = await registry().diff('pkg', '1', '2').catch(e => e);
        expect(unsupported.notSupported).toBe(true);
        expect(unsupported.message).toMatch(/doesn't support/);

        get.mockRejectedValueOnce(registryError(404, 'Release 9.9.9 not found'));
        await expect(registry().diff('pkg', '1', '9.9.9')).rejects.toMatchObject({ status: 404, message: 'Release 9.9.9 not found' });
    });

    test('an unknown report format is rejected', async () => {
        get.mockResolvedValue({ status: 200, data: { ...report, version: 99 }, headers: {} });
        await expect(registry().diff('pkg', '1', '2')).rejects.toThrow(/unsupported format/);
    });

    test('the polling gives up after the timeout', async () => {
        get.mockResolvedValue({ status: 202, data: progress(0), headers: {} });
        await expect(registry().diff('pkg', '1', '2', { timeoutMs: 20, pollIntervalMs: 5 })).rejects.toThrow(/in time/);
    });

    test('a file system registry cannot compare releases', async () => {
        const fileSystem = Object.create(FileSystem.prototype);
        await expect(fileSystem.diff()).rejects.toMatchObject({ status: 501 });
    });
});
