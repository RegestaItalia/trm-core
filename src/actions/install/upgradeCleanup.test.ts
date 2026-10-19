jest.mock('../commons/utils', () => ({
    ...jest.requireActual('../commons/utils/trmBackend'),
    withScopedPrefix: jest.fn(async (_prefix: string, fn: () => Promise<any>) => fn()),
    planInstalledPackageCleanup: jest.fn(),
    generateCleanupDeletions: jest.fn(),
    revertCleanupDeletions: jest.fn(),
    deletePlannedTemporaryPackages: jest.fn()
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static getTransportIcon = jest.fn(() => 'TR');
    },
    TrmTransportIdentifier: { TADIR: 'TADIR', CUST: 'CUST', LANG: 'LANG', DEVC: 'DEVC' }
}));

import { Logger } from 'trm-commons';
import { deletePlannedTemporaryPackages, generateCleanupDeletions, planInstalledPackageCleanup } from '../commons/utils';
import { planUpdateCleanup } from './planUpdateCleanup';
import { importUpdateDeletion, prepareDeletion } from './prepareDeletion';

function context() {
    return {
        rawInput: {
            packageData: { name: 'pkg', registry: { transportEntries: jest.fn() } },
            installData: { import: {}, installDevclass: { keepOriginal: false, replacements: [{ originalDevclass: 'ZPUB', installDevclass: 'ZINST' }] } }
        },
        runtime: {
            update: { manifest: { get: () => ({ version: '1.0.0' }) } },
            skippedCust: [] as string[],
            isLocal: false,
            package: {
                hierarchy: { devclass: 'ZPUB', sub: [] },
                data: {
                    manifest: { name: 'pkg', version: '2.0.0' },
                    transports: [
                        { trkorr: 'TRMK000001', type: 'TADIR' },
                        { trkorr: 'TRMK000002', type: 'CUST' },
                        { trkorr: 'TRMK000003', type: 'CUST' }
                    ]
                }
            },
            transports: {
                tadir: { binaries: { trkorr: 'TRMK000001', entries: { tadir: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZNEW', devclass: 'ZPUB' }] } } },
                cust: [{ binaries: { trkorr: 'TRMK000002', entries: { e071K: [{ objname: 'ZCONF', tabkey: '100A' }] } } }]
            }
        },
        revert: {}
    } as any;
}

beforeEach(() => {
    jest.clearAllMocks();
    for (const method of ['loading', 'log', 'warning', 'success'] as const) {
        jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
    }
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('plan-update-cleanup', () => {
    test('first installs have nothing to clean up', async () => {
        const ctx = context();
        ctx.runtime.update = undefined;

        await expect(planUpdateCleanup.filter(ctx)).resolves.toBe(false);
    });

    test('the incoming release, imported and skipped customizing included, is what is never deleted', async () => {
        const ctx = context();
        ctx.runtime.skippedCust = ['TRMK000003'];
        ctx.rawInput.packageData.registry.transportEntries.mockResolvedValue({ e071K: [{ objname: 'ZCONF', tabkey: '100B' }] });
        (planInstalledPackageCleanup as jest.Mock).mockResolvedValue({ installedVersion: '1.0.0' });

        await planUpdateCleanup.run(ctx);

        expect(ctx.rawInput.packageData.registry.transportEntries).toHaveBeenCalledWith('pkg', '2.0.0', 'TRMK000003');
        expect(planInstalledPackageCleanup).toHaveBeenCalledWith(ctx, expect.objectContaining({
            incomingObjects: ctx.runtime.transports.tadir.binaries.entries.tadir,
            keptDevclasses: ['ZINST'],
            keepCustomizing: false,
            incomingCustomizing: [{ table: 'ZCONF', tabkey: '100A' }, { table: 'ZCONF', tabkey: '100B' }],
            skippedCustomizing: [{ table: 'ZCONF', tabkey: '100B' }]
        }));
        expect(ctx.runtime.cleanupPlan).toEqual({ installedVersion: '1.0.0' });
    });

    test('without customizing import the installed customizing is kept', async () => {
        const ctx = context();
        ctx.rawInput.installData.import.noCust = true;
        ctx.runtime.skippedCust = ['TRMK000002', 'TRMK000003'];

        await planUpdateCleanup.run(ctx);

        expect(ctx.rawInput.packageData.registry.transportEntries).not.toHaveBeenCalled();
        expect(planInstalledPackageCleanup).toHaveBeenCalledWith(ctx, expect.objectContaining({ keepCustomizing: true }));
    });
});

describe('prepare-deletion', () => {
    test('the registry subtracts the incoming release transports, imported or not', async () => {
        const ctx = context();
        ctx.runtime.cleanupPlan = { installedVersion: '1.0.0' };

        await prepareDeletion.run(ctx);

        expect(generateCleanupDeletions).toHaveBeenCalledWith(ctx, ctx.runtime.cleanupPlan, {
            requireDeletion: false,
            incoming: { tadir: { subtract: ['TRMK000001'] }, cust: { subtract: ['TRMK000002', 'TRMK000003'] } }
        });
    });

    test('the fixed trm-server TADIR transport, not stored by the registry, is excluded by its objects', async () => {
        const ctx = context();
        ctx.rawInput.packageData.name = 'trm-server';
        ctx.runtime.package.data.manifest.name = 'trm-server';
        ctx.runtime.transports.tadir.binaries.trkorr = 'TRMK900000';
        ctx.runtime.cleanupPlan = { installedVersion: '1.0.0' };

        await prepareDeletion.run(ctx);

        expect((generateCleanupDeletions as jest.Mock).mock.calls[0][2].incoming.tadir).toEqual({
            objects: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZNEW' }]
        });
    });

    test('the SAP packages and translations of the incoming release are subtracted too: the backup holds them when they exist', async () => {
        const ctx = context();
        ctx.runtime.transports.devc = { binaries: { trkorr: 'TRMK000004', entries: { e071: [{ pgmid: 'R3TR', object: 'DEVC', objName: 'ZPUB' }] } } };
        ctx.runtime.transports.lang = { binaries: { trkorr: 'TRMK000005', entries: { e071: [] } } };
        ctx.runtime.cleanupPlan = { installedVersion: '1.0.0' };

        await prepareDeletion.run(ctx);

        expect((generateCleanupDeletions as jest.Mock).mock.calls[0][2].incoming.tadir).toEqual({
            subtract: ['TRMK000001', 'TRMK000004', 'TRMK000005']
        });
    });

    test('incoming transports the registry does not store are excluded by their objects', async () => {
        const ctx = context();
        ctx.runtime.transports.devc = { binaries: { trkorr: 'A4DK900001', entries: { e071: [
            { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' },
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZPUB' }
        ] } } };
        ctx.runtime.cleanupPlan = { installedVersion: '1.0.0' };

        await prepareDeletion.run(ctx);

        expect((generateCleanupDeletions as jest.Mock).mock.calls[0][2].incoming.tadir).toEqual({
            subtract: ['TRMK000001'],
            objects: [{ pgmid: 'R3TR', object: 'DEVC', objName: 'ZPUB' }]
        });
    });

    test('without a cleanup plan nothing is deleted', async () => {
        await expect(prepareDeletion.filter(context())).resolves.toBe(false);
    });
});

describe('import-update-deletion (trm-server/trm-rest upgrade)', () => {
    function selfUpdate() {
        const ctx = context();
        ctx.runtime.selfUpdate = true;
        ctx.runtime.cleanupPlan = { installedVersion: '1.0.0', temporaryPackages: [] };
        ctx.runtime.deletions = {
            tadir: { trkorr: 'TSTKDEL1', import: jest.fn().mockResolvedValue(0) },
            cust: { trkorr: 'TSTKDEL2', import: jest.fn().mockResolvedValue(4) }
        };
        return ctx;
    }

    test('runs only for a trm-server/trm-rest upgrade', async () => {
        await expect(importUpdateDeletion.filter(context())).resolves.toBe(false);
        await expect(importUpdateDeletion.filter(selfUpdate())).resolves.toBe(true);
    });

    test('imports the deletions after the batch', async () => {
        const ctx = selfUpdate();

        await importUpdateDeletion.run(ctx);

        expect(ctx.runtime.deletions.tadir.import).toHaveBeenCalledWith(false);
        expect(ctx.runtime.deletions.cust.import).toHaveBeenCalledWith(false);
        expect(deletePlannedTemporaryPackages).toHaveBeenCalled();
    });

    test('a failed deletion only warns, and is not carried by the landscape transport', async () => {
        const ctx = selfUpdate();
        ctx.runtime.deletions.tadir.import.mockResolvedValue(8);

        await expect(importUpdateDeletion.run(ctx)).resolves.toBeUndefined();

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Cleanup of pkg 1.0.0 failed'), { important: true });
        expect(ctx.runtime.deletions.tadir).toBeUndefined();
        expect(ctx.runtime.deletions.cust).toBeDefined();
    });
});
