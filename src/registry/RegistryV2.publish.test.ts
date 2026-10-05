import { Logger } from 'trm-commons';
import { RegistryV2 } from './RegistryV2';

describe('registry publish status', () => {
    const artifact = { binary: Buffer.from('artifact') } as any;
    let post: jest.Mock;
    let get: jest.Mock;
    let warning: jest.SpyInstance;

    function registry(): RegistryV2 {
        const registry = new RegistryV2('http://localhost/registry', 'test');
        (registry as any)._axiosInstance = { post, get };
        return registry;
    }

    function accepted() {
        post.mockResolvedValue({
            status: 202,
            data: { progress_pool_url: 'http://localhost/status/1', steps: 5, current_step: 1 }
        });
    }

    beforeEach(() => {
        post = jest.fn();
        get = jest.fn();
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);
        warning = jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'progressbar').mockReturnValue({ start: jest.fn(), update: jest.fn(), stop: jest.fn() } as any);
        const setTimeoutFn = global.setTimeout;
        //skip only the status polling delay
        jest.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void, ms?: number, ...args: any[]) =>
            ms === 5000 ? setTimeoutFn(callback, 0) : setTimeoutFn(callback, ms, ...args)) as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('returns the integrity reported when an async publish completes', async () => {
        accepted();
        get.mockResolvedValue({ data: { progress_pool_url: '', steps: 5, current_step: 5, data: { integrity: 'registry-sha' } } });

        await expect(registry().publish('pkg', '1.0.0', artifact)).resolves.toEqual({ integrity: 'registry-sha' });
    });

    test('returns no integrity when the completed status has no data', async () => {
        accepted();
        get.mockResolvedValue({ data: { progress_pool_url: '', steps: 5, current_step: 5 } });

        await expect(registry().publish('pkg', '1.0.0', artifact)).resolves.toBeUndefined();
    });

    test('rejects when the registry reports a publish error', async () => {
        accepted();
        get.mockResolvedValue({ data: { progress_pool_url: '', steps: 5, current_step: 5, data: { error: 'Invalid package manifest' } } });

        await expect(registry().publish('pkg', '1.0.0', artifact)).rejects.toThrow('Registry rejected publish: Invalid package manifest');
    });

    test('only warns when the status cannot be polled', async () => {
        accepted();
        get.mockRejectedValue(new Error('network down'));

        await expect(registry().publish('pkg', '1.0.0', artifact)).resolves.toBeUndefined();
        expect(warning).toHaveBeenCalledWith(expect.stringContaining('check manually'));
    });

    test('returns no integrity for a sync publish', async () => {
        post.mockResolvedValue({ status: 201, data: {} });

        await expect(registry().publish('pkg', '1.0.0', artifact)).resolves.toBeUndefined();
        expect(get).not.toHaveBeenCalled();
    });
});
