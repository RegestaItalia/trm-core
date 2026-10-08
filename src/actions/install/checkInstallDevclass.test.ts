jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getSubpackages: jest.fn(),
        getDevclass: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { checkInstallDevclass } from './checkInstallDevclass';

// parent -> children
const TDEVC: Record<string, string[]> = {
    ZA: ['ZA_SUB'],
    ZA_SUB: ['ZB'],
    ZB: ['ZB_SUB'],
    ZB_SUB: [],
    ZPARENT: ['ZC'],
    ZC: [],
    ZFREE: []
};

function subpackages(devclass: string): string[] {
    return (TDEVC[devclass] || []).flatMap(o => [o, ...subpackages(o)]);
}

function trmPackage(packageName: string, devclass: string) {
    return { packageName, getDevclass: () => devclass } as any;
}

function context(installDevclasses: Record<string, string>, systemPackages: any[], update?: any) {
    return {
        rawInput: {
            contextData: { systemPackages },
            installData: {
                installDevclass: {
                    replacements: Object.entries(installDevclasses).map(([originalDevclass, installDevclass]) => ({ originalDevclass, installDevclass }))
                }
            }
        },
        runtime: {
            update,
            package: {
                hierarchy: { devclass: 'ZORIG', sub: [{ devclass: 'ZORIG_SUB', sub: [] }] }
            }
        }
    } as any;
}

describe('check-install-devclass', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async (devclass: string) => subpackages(devclass).map(o => ({ devclass: o })));
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) => TDEVC[devclass] ? { devclass } : undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('allows packages outside installed TRM packages', async () => {
        const ctx = context({ ZORIG: 'ZNEW', ZORIG_SUB: 'ZNEW_SUB' }, [trmPackage('a', 'ZA')]);
        await expect(checkInstallDevclass.run(ctx)).resolves.toBeUndefined();
    });

    test('rejects the root package of an installed TRM package', async () => {
        const ctx = context({ ZORIG: 'ZA', ZORIG_SUB: 'ZNEW_SUB' }, [trmPackage('a', 'ZA')]);
        await expect(checkInstallDevclass.run(ctx)).rejects.toThrow('ABAP package ZA belongs to installed TRM package "a"');
    });

    test('rejects a subpackage of an installed TRM package', async () => {
        const ctx = context({ ZORIG: 'ZNEW', ZORIG_SUB: 'ZA_SUB' }, [trmPackage('a', 'ZA')]);
        await expect(checkInstallDevclass.run(ctx)).rejects.toThrow('ABAP package ZA_SUB belongs to installed TRM package "a"');
    });

    test('rejects original package names inside an installed TRM package', async () => {
        const ctx = context({}, [trmPackage('a', 'ZORIG')]);
        await expect(checkInstallDevclass.run(ctx)).rejects.toThrow('ABAP package ZORIG belongs to installed TRM package "a"');
    });

    test('rejects an existing package containing an installed TRM package', async () => {
        const ctx = context({ ZORIG: 'ZPARENT', ZORIG_SUB: 'ZNEW_SUB' }, [trmPackage('c', 'ZC')]);
        await expect(checkInstallDevclass.run(ctx)).rejects.toThrow('ABAP package ZPARENT contains package ZC of installed TRM package "c"');
    });

    test('on update, allows its own installed packages', async () => {
        const update = trmPackage('self', 'ZB');
        const ctx = context({ ZORIG: 'ZB', ZORIG_SUB: 'ZB_SUB' }, [update], update);
        await expect(checkInstallDevclass.run(ctx)).resolves.toBeUndefined();
    });

    test('on update, allows its own packages already nested in another TRM package', async () => {
        const update = trmPackage('self', 'ZB');
        const ctx = context({ ZORIG: 'ZB', ZORIG_SUB: 'ZB_SUB' }, [trmPackage('a', 'ZA'), update], update);
        await expect(checkInstallDevclass.run(ctx)).resolves.toBeUndefined();
    });

    test('on update, rejects packages of the enclosing TRM package outside its own tree', async () => {
        const update = trmPackage('self', 'ZB');
        const ctx = context({ ZORIG: 'ZB', ZORIG_SUB: 'ZA_SUB' }, [trmPackage('a', 'ZA'), update], update);
        await expect(checkInstallDevclass.run(ctx)).rejects.toThrow('ABAP package ZA_SUB belongs to installed TRM package "a"');
    });

    test('on update, rejects packages of a TRM package nested in its own tree', async () => {
        const update = trmPackage('a', 'ZA');
        const ctx = context({ ZORIG: 'ZA', ZORIG_SUB: 'ZB_SUB' }, [update, trmPackage('b', 'ZB')], update);
        await expect(checkInstallDevclass.run(ctx)).rejects.toThrow('ABAP package ZB_SUB belongs to installed TRM package "b"');
    });
});
