import { SystemConnectorBase } from '.';
import { RegistryType } from '../registry';
import { TrmPackage } from '../trmPackage';

function trmPackage(packageName: string, registryType: RegistryType): TrmPackage {
    return { packageName, registry: { getRegistryType: () => registryType } } as unknown as TrmPackage;
}

const publicServer = trmPackage('trm-server', RegistryType.PUBLIC);
const localServer = trmPackage('trm-server', RegistryType.LOCAL);

function connector(readInstalledPackages: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.readInstalledPackages = readInstalledPackages;
    return instance as SystemConnectorBase;
}

describe('SystemConnectorBase installed packages', () => {
    test('leaves local packages out unless asked for', async () => {
        const read = jest.fn().mockResolvedValue([publicServer, localServer]);
        const system = connector(read);

        expect(await system.getInstalledPackages(true)).toEqual([publicServer]);
        expect(await system.getInstalledPackages(true, true)).toEqual([publicServer, localServer]);
    });

    test('a cached read without local packages still serves a caller asking for them', async () => {
        const read = jest.fn().mockResolvedValue([publicServer, localServer]);
        const system = connector(read);

        await system.getInstalledPackages(true);

        expect(await system.getInstalledPackages(false, true)).toEqual([publicServer, localServer]);
        expect(read).toHaveBeenCalledTimes(1);
    });

    test('a cached read with local packages serves a caller excluding them', async () => {
        const read = jest.fn().mockResolvedValue([publicServer, localServer]);
        const system = connector(read);

        await system.getInstalledPackages(true, true);

        expect(await system.getInstalledPackages(false)).toEqual([publicServer]);
        expect(read).toHaveBeenCalledTimes(1);
    });

    test('a filtered read neither uses nor replaces the cached list', async () => {
        const filter = { name: 'trm-server', registry: 'public' };
        const read = jest.fn(async (readFilter?: typeof filter) => readFilter ? [publicServer] : [publicServer, localServer]);
        const system = connector(read);

        await system.getInstalledPackages(true, true);
        expect(await system.getInstalledPackages(false, true, filter)).toEqual([publicServer]);
        expect(read).toHaveBeenLastCalledWith(filter);

        expect(await system.getInstalledPackages(false, true)).toEqual([publicServer, localServer]);
        expect(read).toHaveBeenCalledTimes(2);
    });
});
