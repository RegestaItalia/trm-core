import { SystemConnectorBase } from '.';

function connector(getInstalledPackagesBackend: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.getInstalledPackagesBackend = getInstalledPackagesBackend;
    return instance as SystemConnectorBase;
}

function backendRow(packageName: string, packageRegistry: string, as4Date = '20260101') {
    return {
        packageName,
        packageRegistry,
        manifest: '<manifest/>',
        trkorr: 'DEVK900001',
        as4Date,
        as4Time: '120000',
        integrity: 'sha',
        dirty: [],
        devclass: 'ZROOT',
        packages: ['ZROOT']
    };
}

describe('SystemConnectorBase TRM package data read', () => {
    test('returns the stored row matching both the name and the registry', async () => {
        // The backend filter also keeps rows matching only the name or only the registry.
        const read = jest.fn().mockResolvedValue([
            backendRow('pkg', 'https://other.example'),
            backendRow('other', 'public'),
            backendRow('pkg', 'public')
        ]);

        const row = await connector(read).getTrmPackageData('pkg', 'public');

        expect(read).toHaveBeenCalledWith({ name: 'pkg', registry: 'public' });
        expect(row).toEqual({
            package_name: 'pkg',
            package_registry: 'public',
            manifest: Buffer.from('<manifest/>', 'utf8'),
            trkorr: 'DEVK900001',
            integrity: 'sha',
            devclass: 'ZROOT'
        });
    });

    test('resolves undefined when no row is stored', async () => {
        const read = jest.fn().mockResolvedValue([backendRow('other', 'public')]);

        expect(await connector(read).getTrmPackageData('pkg', 'public')).toBeUndefined();
    });

    test('ignores the entry listed for trm-server installed through abapGit, which has no row', async () => {
        const read = jest.fn().mockResolvedValue([backendRow('trm-server', 'public', '10000101')]);

        expect(await connector(read).getTrmPackageData('trm-server', 'public')).toBeUndefined();
    });

    test('propagates read errors', async () => {
        const read = jest.fn().mockRejectedValue(new Error('backend unavailable'));

        await expect(connector(read).getTrmPackageData('pkg', 'public')).rejects.toThrow('backend unavailable');
    });
});
