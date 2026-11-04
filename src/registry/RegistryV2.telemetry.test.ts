import { Logger } from 'trm-commons';
import { RegistryV2 } from './RegistryV2';

describe('registry telemetry', () => {
    let head: jest.Mock;
    let post: jest.Mock;

    function registry(): RegistryV2 {
        const registry = new RegistryV2('http://localhost/registry', 'test');
        (registry as any)._axiosInstance = { head, post };
        return registry;
    }

    const event: any = { schemaVersion: 1, event: 'install' };

    beforeEach(() => {
        head = jest.fn();
        post = jest.fn();
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('probes once, then posts with a short timeout', async () => {
        head.mockResolvedValue({ status: 204 });
        post.mockResolvedValue({ status: 204 });
        const r = registry();
        await r.telemetry(event);
        await r.telemetry(event);
        expect(head).toHaveBeenCalledTimes(1);
        expect(head).toHaveBeenCalledWith('/telemetry', { timeout: expect.any(Number) });
        expect(post).toHaveBeenCalledTimes(2);
        expect(post).toHaveBeenCalledWith('/telemetry', event, { timeout: expect.any(Number) });
        expect(post.mock.calls[0][2].timeout).toBeLessThanOrEqual(5000);
    });

    test('a registry that does not answer the probe receives no event', async () => {
        head.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
        const r = registry();
        await expect(r.telemetry(event)).resolves.toBeUndefined();
        await r.telemetry(event);
        expect(head).toHaveBeenCalledTimes(1);
        expect(post).not.toHaveBeenCalled();
    });

    test('a failed post never throws', async () => {
        head.mockResolvedValue({ status: 204 });
        post.mockRejectedValue(new Error('timeout of 3000ms exceeded'));
        await expect(registry().telemetry(event)).resolves.toBeUndefined();
    });
});
