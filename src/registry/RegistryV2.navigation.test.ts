import { Logger } from 'trm-commons';
import { RegistryV2 } from './RegistryV2';
import { RegistryFeatureUnsupportedError } from './RegistryFeatureUnsupportedError';
import { RegistryPackageNotFoundError } from './RegistryPackageNotFoundError';

const search = { total: 1, page: 2, limit: 10, results: [{ name: '@org/pkg', version: '1.0.0', maintainers: [], release_date: '2026-01-01T00:00:00.000Z', downloads: 3, private: false }] };
const info = {
    name: '@org/pkg', version: '1.0.0', release_date: '2026-01-01T00:00:00.000Z', private: false, deprecated: false,
    keywords: ['a'], maintainers: [{ name: 'org', type: 'organization' }], downloads: 3, versions: ['1.0.0'],
    version_dates: { '1.0.0': '2026-01-01T00:00:00.000Z' }, yanked_versions: [], dist_tags: { latest: '1.0.0' },
    dependencies: [], has_namespace: true
};
const readme = { name: '@org/pkg', version: '1.0.0', readme: null };
const manifest = { name: '@org/pkg', version: '1.0.0', manifest: { name: '@org/pkg', version: '1.0.0', postActivities: [] } };
const namespace = { namespace: '/ABC/', descriptions: [{ language: 'E', description: 'ABC', owner: 'Me' }] };

/** Error as rejected by the registry axios instance (see getAxiosInstance): `response` is the response body. */
const registryError = (status: number, body: unknown) =>
    Object.assign(new Error(`HTTP ${status}`), { status, response: body });

describe('registry navigation', () => {
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

    test('search joins array filters and omits unset parameters', async () => {
        get.mockResolvedValue({ status: 200, data: search });

        await expect(registry().search({ q: 'pkg', keywords: ['a', 'b'], organizations: ['org'], maintainers: [], sort: 'downloads', page: 2, limit: 10 }))
            .resolves.toEqual(search);
        expect(get).toHaveBeenCalledWith('/search', {
            params: { q: 'pkg', keywords: 'a,b', organizations: 'org', sort: 'downloads', page: 2, limit: 10 }
        });

        await registry().search({ q: 'pkg' });
        expect(get).toHaveBeenLastCalledWith('/search', { params: { q: 'pkg' } });
    });

    test('search is not cached', async () => {
        get.mockResolvedValue({ status: 200, data: search });
        const r = registry();
        await r.search({ q: 'pkg' });
        await r.search({ q: 'pkg' });
        expect(get).toHaveBeenCalledTimes(2);
    });

    test.each([
        ['getPackageInfo', 'info', info],
        ['getReadme', 'readme', readme],
        ['getManifest', 'manifest', manifest],
        ['getNamespace', 'namespace', namespace]
    ] as const)('%s reads /package/%s/{package} for scoped and unscoped packages', async (method, route, body) => {
        get.mockResolvedValue({ status: 200, data: body });
        const r = registry();

        await expect((r as any)[method]('@org/pkg', '1.0.0')).resolves.toEqual(body);
        expect(get).toHaveBeenLastCalledWith(`/package/${route}/@org/pkg`, { params: { version: '1.0.0' } });

        await expect((r as any)[method]('pkg')).resolves.toEqual(body);
        expect(get).toHaveBeenLastCalledWith(`/package/${route}/pkg`, { params: { version: 'latest' } });
    });

    test('successful package reads are cached per method, package and version', async () => {
        get.mockImplementation(async (url: string) => ({ status: 200, data: url.startsWith('/package/info/') ? info : readme }));
        const r = registry();

        await r.getPackageInfo('@org/pkg', '1.0.0');
        await r.getPackageInfo('@org/pkg', '1.0.0');
        expect(get).toHaveBeenCalledTimes(1);
        await r.getReadme('@org/pkg', '1.0.0');
        await r.getPackageInfo('@org/pkg', '2.0.0');
        await r.getPackageInfo('@org/other', '1.0.0');
        expect(get).toHaveBeenCalledTimes(4);
    });

    test.each([
        ['501', registryError(501, { message: 'Not implemented' })],
        ['405', registryError(405, { message: 'Method not allowed' })],
        ['404 HTML page', registryError(404, '<!DOCTYPE html><html><body><pre>Cannot GET /registry/search</pre></body></html>')],
        ['404 empty body', registryError(404, {})]
    ])('%s means the feature is unsupported', async (_name, error) => {
        get.mockRejectedValue(error);

        const searchError = await registry().search({ q: 'x' }).catch(e => e);
        expect(searchError).toBeInstanceOf(RegistryFeatureUnsupportedError);
        expect(searchError.feature).toBe('search');

        const readmeError = await registry().getReadme('@org/pkg').catch(e => e);
        expect(readmeError).toBeInstanceOf(RegistryFeatureUnsupportedError);
        expect(readmeError.feature).toBe('readme');
    });

    test('a raw axios 404 without a registry message is unsupported, with one is not found', async () => {
        const axios404 = (data: unknown) => Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404, data } });
        get.mockRejectedValueOnce(axios404('Cannot GET'));
        await expect(registry().getManifest('pkg')).rejects.toBeInstanceOf(RegistryFeatureUnsupportedError);
        get.mockRejectedValueOnce(axios404({ message: 'Package not found' }));
        await expect(registry().getManifest('pkg')).rejects.toBeInstanceOf(RegistryPackageNotFoundError);
    });

    test('a 404 with a registry message is a package not found', async () => {
        get.mockRejectedValue(registryError(404, { message: 'Package not found' }));

        for (const method of ['getPackageInfo', 'getReadme', 'getManifest', 'getNamespace']) {
            const error = await (registry() as any)[method]('@org/pkg', '1.0.0').catch(e => e);
            expect(error).toBeInstanceOf(RegistryPackageNotFoundError);
            expect(error).toMatchObject({ packageName: '@org/pkg', requestedVersion: '1.0.0' });
        }
    });

    test('a search 404 with a registry message is passed through', async () => {
        const error = registryError(404, { message: 'Nothing here' });
        get.mockRejectedValue(error);
        await expect(registry().search({ q: 'x' })).rejects.toBe(error);
    });

    test('auth and other errors are passed through and not remembered', async () => {
        const r = registry();
        const auth = registryError(401, { message: 'Unauthorized' });
        get.mockRejectedValueOnce(auth).mockResolvedValueOnce({ status: 200, data: info });
        await expect(r.getPackageInfo('pkg')).rejects.toBe(auth);
        await expect(r.getPackageInfo('pkg')).resolves.toEqual(info);
    });

    test('an unexpected payload (e.g. an HTML page with status 200) is unsupported', async () => {
        get.mockResolvedValue({ status: 200, data: '<html></html>' });
        await expect(registry().getNamespace('pkg')).rejects.toBeInstanceOf(RegistryFeatureUnsupportedError);
    });

    test('an unsupported feature is remembered per registry and feature', async () => {
        const r = registry();
        get.mockRejectedValueOnce(registryError(501, { message: 'Not implemented' }));
        await expect(r.getReadme('pkg')).rejects.toBeInstanceOf(RegistryFeatureUnsupportedError);
        await expect(r.getReadme('other', '2.0.0')).rejects.toMatchObject({ feature: 'readme' });
        expect(get).toHaveBeenCalledTimes(1);

        get.mockResolvedValue({ status: 200, data: info });
        await expect(r.getPackageInfo('pkg')).resolves.toEqual(info);
        get.mockResolvedValue({ status: 200, data: readme });
        await expect(registry().getReadme('pkg')).resolves.toEqual(readme);
    });
});
