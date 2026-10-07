jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getInstallPackages: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { setInstallDevclass } from './setInstallDevclass';

describe('set-install-devclass namespace carry-over', () => {
    function context(installedRoot: string | undefined, previousInstallPackages: any[]) {
        return {
            rawInput: {
                packageData: { name: 'pkg' },
                contextData: { noInquirer: true },
                installData: {
                    installDevclass: {
                        replacements: [{ originalDevclass: 'ZORIG', installDevclass: 'ZROOT' }]
                    }
                }
            },
            runtime: {
                isTrmServer: false,
                isTrmRest: false,
                update: { getDevclass: () => installedRoot },
                previousInstallPackages,
                package: {
                    hierarchy: { devclass: 'ZORIG', sub: [{ devclass: 'ZORIG_NEW', sub: [] }] }
                }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('uses the installed root devclass namespace', async () => {
        const ctx = context('/INST/ROOT', []);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZORIG_NEW', installDevclass: '/INST/ORIG_NEW'
        });
    });

    test('falls back to the stored root replacement when the installed root devclass is unknown', async () => {
        const ctx = context(undefined, [{ originalDevclass: 'ZORIG', installDevclass: '/STORED/ROOT' }]);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZORIG_NEW', installDevclass: '/STORED/ORIG_NEW'
        });
    });

    test('keeps the original namespace when neither the installed nor the stored root is known', async () => {
        const ctx = context(undefined, []);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZORIG_NEW', installDevclass: 'ZORIG_NEW'
        });
    });

    test('moves a new devclass of the original root namespace to the installed namespace', async () => {
        // ZFOO installed as /ACME/FOO: a new ZFOO_B must follow it under /ACME/.
        const ctx = context('/ACME/FOO', []);
        ctx.runtime.package.hierarchy = { devclass: 'ZFOO', sub: [{ devclass: 'ZFOO_B', sub: [] }] };
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: 'ZFOO', installDevclass: '/ACME/FOO' }];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZFOO_B', installDevclass: '/ACME/FOO_B'
        });
    });

    test('moves a new devclass out of a reserved original namespace', async () => {
        const ctx = context('ZFOO', []);
        ctx.runtime.package.hierarchy = { devclass: '/ACME/FOO', sub: [{ devclass: '/ACME/FOO_B', sub: [] }] };
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: '/ACME/FOO', installDevclass: 'ZFOO' }];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: '/ACME/FOO_B', installDevclass: 'ZFOO_B'
        });
    });

    test('a temporary original namespace is matched literally', async () => {
        const ctx = context('/ACME/FOO', []);
        ctx.runtime.package.hierarchy = { devclass: '$FOO', sub: [{ devclass: '$FOO_B', sub: [] }] };
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: '$FOO', installDevclass: '/ACME/FOO' }];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: '$FOO_B', installDevclass: '/ACME/FOO_B'
        });
    });

    test('a temporary installed namespace is written literally', async () => {
        const ctx = context('$FOO', []);
        ctx.runtime.package.hierarchy = { devclass: 'ZFOO', sub: [{ devclass: 'ZFOO_B', sub: [] }] };
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: 'ZFOO', installDevclass: '$FOO' }];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZFOO_B', installDevclass: '$FOO_B'
        });
    });

    test('a new devclass outside the original root namespace keeps its name', async () => {
        const ctx = context('/ACME/FOO', []);
        ctx.runtime.package.hierarchy = { devclass: 'ZFOO', sub: [{ devclass: 'YFOO_B', sub: [] }] };
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: 'ZFOO', installDevclass: '/ACME/FOO' }];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'YFOO_B', installDevclass: 'YFOO_B'
        });
    });

    test('rejects more than one reserved namespace before locks and dependency installs', async () => {
        const ctx = context('/INST/ROOT', []);
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZORIG', installDevclass: '/ACME/ROOT' },
            { originalDevclass: 'ZORIG_NEW', installDevclass: '/OTHER/SUB' }
        ];
        await expect(setInstallDevclass.run(ctx)).rejects.toThrow('SAP packages must use at most one namespace, found: /ACME/, /OTHER/.');
    });
});

describe('set-install-devclass stored mappings', () => {
    function context(stored: any[]) {
        return {
            rawInput: {
                packageData: { name: 'pkg', registry: {} },
                contextData: { noInquirer: true },
                installData: { installDevclass: { replacements: [] } }
            },
            runtime: {
                isTrmServer: false,
                isTrmRest: false,
                update: { getDevclass: () => 'ZFOO_INST' },
                installRegistry: { endpoint: 'https://private.example' },
                previousInstallPackages: stored,
                package: {
                    //v2 dropped ZFOO_OLD
                    hierarchy: { devclass: 'ZFOO', sub: [{ devclass: 'ZFOO_SUB', sub: [] }] }
                }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('drops stored mappings of devclasses removed from the release', async () => {
        const stored = [
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_INST' },
            { originalDevclass: 'ZFOO_OLD', installDevclass: 'ZFOO_OLD_INST' }
        ];
        (SystemConnector.getInstallPackages as jest.Mock).mockResolvedValue([...stored]);
        const ctx = context(stored);
        await setInstallDevclass.run(ctx);
        expect(SystemConnector.getInstallPackages).toHaveBeenCalledWith('pkg', ctx.runtime.installRegistry);
        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_INST' }
        ]);
        expect(ctx.rawInput.installData.installDevclass.keepOriginal).toBe(false);
    });

    test('keeping the original names maps the devclasses new in this release too', async () => {
        //v1 had ZFOO only, the release adds ZFOO_SUB back
        const stored = [{ originalDevclass: 'ZFOO', installDevclass: 'ZFOO' }];
        (SystemConnector.getInstallPackages as jest.Mock).mockResolvedValue([...stored]);
        const ctx = context(stored);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.keepOriginal).toBe(true);
        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB' }
        ]);
    });

    test('drops removed devclasses before keeping the original names', async () => {
        const stored = [
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB' },
            { originalDevclass: 'ZFOO_OLD', installDevclass: 'ZFOO_OLD_INST' }
        ];
        (SystemConnector.getInstallPackages as jest.Mock).mockResolvedValue([...stored]);
        const ctx = context(stored);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.keepOriginal).toBe(true);
        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB' }
        ]);
    });

    test('a partial explicit replacement keeps the stored mappings of the other devclasses', async () => {
        const ctx = context([
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' },
            { originalDevclass: 'ZFOO_OLD', installDevclass: 'ZFOO_OLD_INST' }
        ]);
        //only the new subpackage is given
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_NEW' }];

        await setInstallDevclass.run(ctx);

        expect(SystemConnector.getInstallPackages).not.toHaveBeenCalled();
        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_NEW' },
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' }
        ]);
        expect(ctx.rawInput.installData.installDevclass.keepOriginal).toBe(false);
    });

    test('an explicit replacement overrides the stored mapping of the same devclass', async () => {
        const stored = [
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_INST' }
        ];
        const ctx = context(stored);
        ctx.rawInput.installData.installDevclass.replacements = [{ originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_NEW' }];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_NEW' },
            { originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' }
        ]);
        //the stored rows are not changed: the metadata revert restores them
        expect(stored[1]).toEqual({ originalDevclass: 'ZFOO_SUB', installDevclass: 'ZFOO_SUB_INST' });
    });

    test('explicit replacements on a first install are not merged', async () => {
        const ctx = context([{ originalDevclass: 'ZFOO', installDevclass: 'ZFOO_INST' }]);
        ctx.runtime.update = undefined;
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZFOO', installDevclass: 'ZNEW' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZNEW_SUB' }
        ];

        await setInstallDevclass.run(ctx);

        expect(ctx.rawInput.installData.installDevclass.replacements).toEqual([
            { originalDevclass: 'ZFOO', installDevclass: 'ZNEW' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZNEW_SUB' }
        ]);
    });

    test('drops explicit replacements of devclasses not in the release', async () => {
        const ctx = context([]);
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZFOO', installDevclass: 'ZNEW' },
            { originalDevclass: 'ZFOO_SUB', installDevclass: 'ZNEW_SUB' },
            { originalDevclass: 'ZUNKNOWN', installDevclass: 'ZNEW_UNKNOWN' }
        ];
        await setInstallDevclass.run(ctx);
        expect(SystemConnector.getInstallPackages).not.toHaveBeenCalled();
        expect(ctx.rawInput.installData.installDevclass.replacements.map((o: any) => o.originalDevclass)).toEqual(['ZFOO', 'ZFOO_SUB']);
    });
});
