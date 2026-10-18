jest.mock('../../../commons', () => ({
    PackageHierarchy: class {},
    packageDataFromTdevc: jest.fn((_source, overrides) => overrides),
    getPackageNamespace: jest.fn((devclass: string) => devclass.startsWith('/') ? devclass.substring(0, devclass.indexOf('/', 1) + 1) : '')
}));

jest.mock('../../../systemConnector', () => ({
    SystemConnector: {
        getDevclass: jest.fn(),
        createPackage: jest.fn(),
        getLogonUser: jest.fn(() => 'TESTER'),
        getExistingObjects: jest.fn(),
        tadirInterface: jest.fn(),
        deleteTemporaryPackage: jest.fn(),
        getObjectsLocks: jest.fn(),
        getSubpackages: jest.fn(),
        getDevclassObjects: jest.fn(),
        getDefaultTransportLayer: jest.fn(),
        getNamespace: jest.fn(),
        getNamespacePackages: jest.fn(),
        readTable: jest.fn(async () => [{ role: 'C' }]),
        addNamespace: jest.fn(),
        getDest: jest.fn(() => 'TST'),
        deleteTmsTransport: jest.fn()
    }
}));

jest.mock('../../../transport', () => {
    class MockTransport {
        static upload = jest.fn();
        static createToc = jest.fn();
        static getTransportIcon = jest.fn(() => 'TR');
        static existing = new Set<string>();
        static customizingKeys: Record<string, { table: string, tabkey?: string }[]> = {};
        getE070 = jest.fn(async () => MockTransport.existing.has(this.trkorr) ? { trkorr: this.trkorr } : undefined);
        getCustomizingKeys = jest.fn(async () => MockTransport.customizingKeys[this.trkorr] || []);
        addObjectsFromTransport = jest.fn().mockResolvedValue(undefined);
        canBeDeleted = jest.fn(async () => false);
        delete = jest.fn().mockResolvedValue(undefined);
        addObjects = jest.fn().mockResolvedValue(undefined);
        release = jest.fn().mockResolvedValue(undefined);
        download = jest.fn(async () => ({ binaries: { header: Buffer.from(this.trkorr), data: Buffer.from('d') } }));
        import = jest.fn().mockResolvedValue(0);
        constructor(public trkorr: string) { }
    }
    return { Transport: MockTransport, TrmTransportIdentifier: { CUST: 'CUST', LANG: 'LANG' }, getE071KOwner: jest.requireActual('../../../transport/E071KOwner').getE071KOwner };
});

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../../systemConnector';
import { Transport } from '../../../transport';
import { RegistryDeletionTransportUnavailableError, RegistryType } from '../../../registry';
import {
    backupInstalledPackage, CleanupPlan, generateCleanupDeletions, PackageCleanupTarget, planInstalledPackageCleanup,
    restoreCleanupBackups, revertCleanupDeletions
} from './packageCleanup';
import { isBackupTransport } from './importQueue';

const MockTransport = Transport as any;

function obj(object: string, objName: string, devclass?: string) {
    return { pgmid: 'R3TR', object, objName, ...(devclass ? { devclass } : {}) };
}

function context(previous: any[], options: { devclass?: string, noInquirer?: boolean, previousInstallTransports?: any[] } = {}) {
    return {
        lockScope: { acquire: jest.fn().mockResolvedValue(undefined) },
        rawInput: {
            packageData: { name: 'pkg', registry: { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn() } },
            contextData: { noInquirer: options.noInquirer ?? true, systemPackages: [] }
        },
        runtime: {
            update: {
                manifest: { get: () => ({ version: '1.0.0' }) },
                getTransport: () => ({ getE071: async () => previous, getE071K: async () => [] }),
                getDevclass: () => options.devclass ?? 'ZROOT'
            },
            previousInstallPackages: [],
            previousInstallTransports: options.previousInstallTransports || []
        },
        revert: { sapPackages: [] }
    } as any;
}

function target(incoming: any[] = [], extra: Partial<PackageCleanupTarget> = {}): PackageCleanupTarget {
    return { incomingObjects: incoming, keptDevclasses: ['ZROOT'], prefix: '', actionName: 'Update', ...extra };
}

/** Objects on the system, by SAP package. */
function system(objects: Record<string, any[]>, subpackages: Record<string, any[]> = {}) {
    const all = Object.entries(objects).flatMap(([devclass, list]) => list.map(o => ({ ...o, devclass })));
    (SystemConnector.getDevclassObjects as jest.Mock).mockImplementation(async (devclass: string) => all.filter(o => o.devclass === devclass));
    (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async (devclass: string) => subpackages[devclass] || []);
    (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async (list: any[]) => list
        .map(o => all.find(a => a.object === o.object && a.objName === o.objName))
        .filter(Boolean));
}

const keys = (list: any[]) => list.map(o => `${o.object} ${o.objName}`).sort();

beforeEach(() => {
    jest.clearAllMocks();
    MockTransport.existing = new Set();
    MockTransport.customizingKeys = {};
    for (const method of ['loading', 'log', 'info', 'warning', 'error', 'success'] as const) {
        jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
    }
    jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
    jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
    jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
    jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
    (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
    (SystemConnector.getNamespace as jest.Mock).mockResolvedValue(undefined);
    (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('planInstalledPackageCleanup', () => {
    test('an upgrade deletes only what the incoming release does not ship: shared objects and tables are updated by the import', async () => {
        const previous = [obj('CLAS', 'ZCL_KEEP'), obj('TABL', 'ZTAB'), obj('PROG', 'ZOLD'), { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' }, { pgmid: 'CORR', object: 'MERG', objName: 'X' }];
        system({ ZROOT: [obj('CLAS', 'ZCL_KEEP'), obj('TABL', 'ZTAB'), obj('PROG', 'ZOLD')] });

        const plan = await planInstalledPackageCleanup(context(previous), target([obj('CLAS', 'ZCL_KEEP', 'ZROOT'), obj('TABL', 'ZTAB', 'ZROOT')]));

        expect(keys(plan.backupObjects)).toEqual(['CLAS ZCL_KEEP', 'PROG ZOLD', 'TABL ZTAB']);
        expect(keys(plan.previewObjects)).toEqual(['PROG ZOLD']);
        expect(plan.excludeObjects).toEqual([]);
    });

    test('an unchanged release deletes nothing', async () => {
        const previous = [obj('CLAS', 'ZCL_A'), obj('PROG', 'ZB')];
        system({ ZROOT: previous });

        const plan = await planInstalledPackageCleanup(context(previous), target(previous.map(o => ({ ...o, devclass: 'ZROOT' }))));

        expect(plan.previewObjects).toEqual([]);
        expect(SystemConnector.getObjectsLocks).not.toHaveBeenCalled();
    });

    test('objects missing on the system are neither backed up nor deleted', async () => {
        system({ ZROOT: [obj('PROG', 'ZHERE')] });

        const plan = await planInstalledPackageCleanup(context([obj('PROG', 'ZHERE'), obj('PROG', 'ZGONE')]), target());

        expect(keys(plan.backupObjects)).toEqual(['PROG ZHERE']);
    });

    test('locally added objects are backed up and deleted once confirmed, otherwise excluded', async () => {
        system({ ZROOT: [obj('PROG', 'ZOLD'), obj('PROG', 'ZLOCAL')] });
        const ctx = context([obj('PROG', 'ZOLD')], { noInquirer: false });
        jest.spyOn(Inquirer, 'prompt').mockResolvedValueOnce({ deleteExtraObjects: false } as any);

        const plan = await planInstalledPackageCleanup(ctx, target([], { keptDevclasses: [] }));

        expect(keys(plan.backupObjects)).toEqual(['PROG ZLOCAL', 'PROG ZOLD']);
        expect(keys(plan.excludeObjects)).toEqual(['PROG ZLOCAL']);
        expect(keys(plan.previewObjects)).toEqual(['PROG ZOLD']);
    });

    test('a SAP package is deleted only with its whole subtree, never when the incoming release keeps it', async () => {
        const previous = [obj('DEVC', 'ZROOT'), obj('DEVC', 'ZSUB'), obj('PROG', 'ZOLD')];
        system({ ZROOT: [obj('DEVC', 'ZROOT')], ZSUB: [obj('DEVC', 'ZSUB'), obj('PROG', 'ZOLD')] }, { ZROOT: [{ devclass: 'ZSUB', parentcl: 'ZROOT' }] });

        const plan = await planInstalledPackageCleanup(context(previous), target([], { keptDevclasses: ['ZROOT'] }));

        expect(keys(plan.previewObjects)).toEqual(['DEVC ZSUB', 'PROG ZOLD']);
    });

    test('installed objects moved outside the installation are kept unless confirmed', async () => {
        system({ ZROOT: [], ZCUSTOMER: [obj('PROG', 'ZMOVED')] });

        const plan = await planInstalledPackageCleanup(context([obj('PROG', 'ZMOVED')]), target());

        expect(keys(plan.excludeObjects)).toEqual(['PROG ZMOVED']);
        expect(plan.previewObjects).toEqual([]);
    });

    test('the namespace is kept when the incoming release uses it', async () => {
        const ctx = context([obj('PROG', '/NS/OLD')], { devclass: '/NS/ROOT' });
        system({ '/NS/ROOT': [obj('PROG', '/NS/OLD')] });
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ namespace: '/NS/' });
        (SystemConnector.getNamespacePackages as jest.Mock).mockResolvedValue([]);

        const kept = await planInstalledPackageCleanup(ctx, target([], { keptDevclasses: ['/NS/ROOT'] }));
        expect(keys(kept.previewObjects)).toEqual(['PROG /NS/OLD']);

        const uninstall = await planInstalledPackageCleanup(ctx, target([], { keptDevclasses: [] }));
        expect(keys(uninstall.previewObjects)).toContain('NSPC /NS/');
    });

    test('lock conflicts abort before anything changes', async () => {
        system({ ZROOT: [obj('PROG', 'ZOLD')] });
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'PROG', objName: 'ZOLD', trkorr: 'TSTK1' }]);

        await expect(planInstalledPackageCleanup(context([obj('PROG', 'ZOLD')]), target())).rejects.toThrow('Update aborted');
        expect(Transport.createToc).not.toHaveBeenCalled();
        expect(SystemConnector.tadirInterface).not.toHaveBeenCalled();
    });

    test('an installation without transport is what its SAP packages contain', async () => {
        system({ ZROOT: [obj('PROG', 'ZLIVE')] });
        const ctx = context([]);

        const plan = await planInstalledPackageCleanup(ctx, target([], { liveObjectsArePrevious: true }));

        expect(keys(plan.previewObjects)).toEqual(['PROG ZLIVE']);
    });

    test('local ($) SAP packages are deleted through their API, descendants first', async () => {
        const previous = [obj('DEVC', '$ROOT'), obj('DEVC', '$SUB'), obj('PROG', 'ZOLD')];
        system({ $ROOT: [obj('DEVC', '$ROOT')], $SUB: [obj('DEVC', '$SUB'), obj('PROG', 'ZOLD')] }, { $ROOT: [{ devclass: '$SUB', parentcl: '$ROOT' }] });

        const plan = await planInstalledPackageCleanup(context(previous, { devclass: '$ROOT' }), target([], { keptDevclasses: [] }));

        expect(plan.needsStaging).toBe(true);
        expect(plan.temporaryPackages.map(o => o.objName)).toEqual(['$SUB', '$ROOT']);
        expect(keys(plan.backupObjects)).toEqual(['PROG ZOLD']);
    });

    describe('customizing of the installed release', () => {
        function custContext(noInquirer = true) {
            MockTransport.existing.add('TSTKCUST1');
            system({ ZROOT: [] });
            return context([], { noInquirer, previousInstallTransports: [{ trkorr: 'TSTKCUST1', trmType: 'CUST' }] });
        }

        test('rows shipped again (imported or skipped transports) are never deleted, the others are', async () => {
            MockTransport.customizingKeys.TSTKCUST1 = [
                { table: 'ZCONF', tabkey: '100IMPORTED' },
                { table: 'ZCONF', tabkey: '100SKIPPED' },
                { table: 'ZCONF', tabkey: '100LOST' }
            ];
            const skipped = [{ table: 'ZCONF', tabkey: '100SKIPPED' }];

            const plan = await planInstalledPackageCleanup(custContext(), target([], {
                incomingCustomizing: [{ table: 'ZCONF', tabkey: '100IMPORTED' }, ...skipped],
                skippedCustomizing: skipped
            }));

            expect(plan.customizingSources).toEqual(['TSTKCUST1']);
            expect(plan.previewKeys).toEqual([{ table: 'ZCONF', tabkey: '100LOST' }]);
            expect(plan.excludeKeys).toEqual([]);
            // the source still owns the row kept by the skipped transport
            expect(plan.retainedCustomizingSources).toEqual(['TSTKCUST1']);
        });

        test('a row rewritten by an imported transport leaves no retained source', async () => {
            MockTransport.customizingKeys.TSTKCUST1 = [{ table: 'ZCONF', tabkey: '100A' }];

            const plan = await planInstalledPackageCleanup(custContext(), target([], { incomingCustomizing: [{ table: 'ZCONF' }] }));

            expect(plan.previewKeys).toEqual([]);
            expect(plan.retainedCustomizingSources).toEqual([]);
        });

        test('declined rows are kept and their source recorded again', async () => {
            MockTransport.customizingKeys.TSTKCUST1 = [{ table: 'ZCONF', tabkey: '100LOST' }];
            const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValueOnce({ deleteCustomizing: false } as any);

            const plan = await planInstalledPackageCleanup(custContext(false), target());

            expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ default: true }));
            expect(plan.previewKeys).toEqual([]);
            expect(plan.excludeKeys).toEqual([{ table: 'ZCONF', tabkey: '100LOST' }]);
            expect(plan.retainedCustomizingSources).toEqual(['TSTKCUST1']);
        });

        test('a generic key or whole table is only deleted when confirmed (kept without prompts)', async () => {
            MockTransport.customizingKeys.TSTKCUST1 = [{ table: 'ZCONF', tabkey: '100*' }, { table: 'ZWHOLE' }];

            const plan = await planInstalledPackageCleanup(custContext(), target());

            expect(plan.previewKeys).toEqual([]);
            expect(plan.excludeKeys).toEqual([{ table: 'ZCONF', tabkey: '100*' }, { table: 'ZWHOLE', tabkey: '*' }]);
        });

        test('without customizing import the installed customizing is kept', async () => {
            MockTransport.customizingKeys.TSTKCUST1 = [{ table: 'ZCONF', tabkey: '100A' }];

            const plan = await planInstalledPackageCleanup(custContext(), target([], { keepCustomizing: true }));

            expect(plan.customizingSources).toEqual([]);
            expect(plan.previewKeys).toEqual([]);
        });
    });
});

function plan(overrides: Partial<CleanupPlan> = {}): CleanupPlan {
    return {
        packageName: 'pkg', installedVersion: '1.0.0',
        backupObjects: [obj('PROG', 'ZOLD'), obj('PROG', 'ZKEEP')],
        excludeObjects: [obj('PROG', 'ZKEEP')],
        previewObjects: [obj('PROG', 'ZOLD')],
        customizingSources: [], excludeKeys: [], previewKeys: [], retainedCustomizingSources: [],
        temporaryPackages: [], needsStaging: false,
        ...overrides
    };
}

describe('backupInstalledPackage', () => {
    test('backs up the planned and the overwritten objects, and the installed customizing, in protected released transports', async () => {
        const tadir = new MockTransport('TSTKBKP1');
        const cust = new MockTransport('TSTKBKP2');
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(tadir).mockResolvedValueOnce(cust);
        const ctx = context([]);

        await backupInstalledPackage(ctx, plan({ customizingSources: ['TSTKCUST1'] }), [obj('CLAS', 'ZCL_OVERWRITTEN', 'ZOTHER') as any], { packageName: 'pkg', version: '1.0.0' });

        expect(Transport.createToc).toHaveBeenNthCalledWith(1, { text: '@X1@TRM (BKP) pkg 1.0.0', target: 'TST' });
        expect(Transport.createToc).toHaveBeenNthCalledWith(2, { text: '@X1@TRM (BKP) pkg 1.0.0', target: 'TST' });
        expect(keys(tadir.addObjects.mock.calls[0][0])).toEqual(['CLAS ZCL_OVERWRITTEN', 'PROG ZKEEP', 'PROG ZOLD']);
        expect(cust.addObjectsFromTransport).toHaveBeenCalledWith('TSTKCUST1');
        // the release log is read: an export error stops the action before anything is deleted
        expect(tadir.release).toHaveBeenCalledWith(false, true, expect.stringContaining('trm'));
        expect(cust.release).toHaveBeenCalledWith(false, true, expect.stringContaining('trm'));
        expect(ctx.revert.backup.tadir.binaries.trkorr).toBe('TSTKBKP1');
        expect(ctx.revert.backup.cust.binaries.trkorr).toBe('TSTKBKP2');
        expect(isBackupTransport('TSTKBKP1')).toBe(true);
        expect(isBackupTransport('TSTKBKP2')).toBe(true);
    });

    test('a backup is tracked before its release can fail', async () => {
        const tadir = new MockTransport('TSTKBKP3');
        tadir.release.mockRejectedValue(new Error('release failed'));
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(tadir);
        const ctx = context([]);

        await expect(backupInstalledPackage(ctx, plan(), [], { packageName: 'pkg', version: '1.0.0' })).rejects.toThrow('release failed');
        expect(ctx.revert.backupTransports).toEqual([tadir]);
        expect(tadir.delete).not.toHaveBeenCalled();
    });

    test('objects of a local ($) installation are staged in a transportable package, deleted with them', async () => {
        const tadir = new MockTransport('TSTKBKP4');
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(tadir);
        system({ $ROOT: [obj('PROG', 'ZOLD')] });
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
        const ctx = context([]);

        await backupInstalledPackage(ctx, plan({ needsStaging: true, backupObjects: [obj('PROG', 'ZOLD')], excludeObjects: [] }), [], { packageName: 'pkg', version: '1.0.0' });

        const staging = ctx.revert.stagingPackages[0];
        expect(staging).toMatch(/^ZTRM_DELE_/);
        expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(expect.objectContaining({ objName: 'ZOLD', devclass: staging }));
        expect(ctx.revert.cleanupOriginalTadir).toEqual([expect.objectContaining({ objName: 'ZOLD', devclass: '$ROOT' })]);
        expect(keys(tadir.addObjects.mock.calls[0][0])).toEqual([`DEVC ${staging}`, 'PROG ZOLD']);
    });
});

describe('generateCleanupDeletions', () => {
    function backedUp(ctx: any) {
        ctx.revert.backup = {
            tadir: { transport: new MockTransport('TSTKBKP1'), description: '@X1@TRM (BKP) pkg 1.0.0', binaries: { trkorr: 'TSTKBKP1', binaries: { header: Buffer.from('h'), data: Buffer.from('d') } } },
            cust: { transport: new MockTransport('TSTKBKP2'), description: '@X1@TRM (BKP) pkg 1.0.0', binaries: { trkorr: 'TSTKBKP2', binaries: { header: Buffer.from('h'), data: Buffer.from('d') } } }
        };
        return ctx;
    }

    test('deletion dummies receive backup minus incoming release minus exclusions', async () => {
        const ctx = backedUp(context([]));
        const deleTadir = new MockTransport('TSTKDEL1');
        const deleCust = new MockTransport('TSTKDEL2');
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(deleTadir).mockResolvedValueOnce(deleCust);
        const uploaded = new MockTransport('TSTKDEL1');
        (Transport.upload as jest.Mock).mockResolvedValue(uploaded);
        ctx.rawInput.packageData.registry.delete
            .mockResolvedValueOnce({ empty: false, binaries: {}, deleted: { e071: [obj('PROG', 'ZOLD')], e071k: [] } })
            .mockResolvedValueOnce({ empty: false, binaries: {}, deleted: { e071: [], e071k: [{ table: 'ZCONF', tabkey: '001A' }] } });

        await generateCleanupDeletions(ctx, plan({ previewKeys: [{ table: 'ZCONF', tabkey: '100A' }], excludeKeys: [{ table: 'ZCONF', tabkey: '100B' }] }), {
            requireDeletion: false,
            incoming: { tadir: { subtract: ['TRMK000001'] }, cust: { subtract: ['TRMK000002'] } }
        });

        expect(Transport.createToc).toHaveBeenNthCalledWith(1, { text: '@X1@TRM (DELE) pkg 1.0.0', target: 'TST' });
        expect(Transport.createToc).toHaveBeenNthCalledWith(2, { text: '@X1@TRM (DELE) pkg 1.0.0', target: 'TST' });
        expect(ctx.rawInput.packageData.registry.delete).toHaveBeenNthCalledWith(1, expect.anything(), {
            target: 'TSTKDEL1', subtract: ['TRMK000001'], exclude: { e071: [obj('PROG', 'ZKEEP')] }
        });
        expect(ctx.rawInput.packageData.registry.delete).toHaveBeenNthCalledWith(2, expect.anything(), {
            target: 'TSTKDEL2', subtract: ['TRMK000002'], exclude: { e071k: [{ table: 'ZCONF', tabkey: '100B' }] }
        });
        expect(ctx.runtime.deletions.tadir).toBe(uploaded);
        expect(ctx.revert.deletionDummies).toEqual([deleTadir, deleCust]);
    });

    test('nothing to delete: no dummy is created', async () => {
        const ctx = backedUp(context([]));

        await generateCleanupDeletions(ctx, plan({ previewObjects: [] }), { requireDeletion: false });

        expect(Transport.createToc).not.toHaveBeenCalled();
        expect(ctx.runtime.deletions).toEqual({});
    });

    test('an unavailable registry deletion lists the leftovers, takes the dummy out of the queue, and the upgrade goes on', async () => {
        const ctx = backedUp(context([]));
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(new MockTransport('TSTKDEL1'));
        ctx.rawInput.packageData.registry.delete.mockRejectedValue(new RegistryDeletionTransportUnavailableError('endpoint', 'denied', new Error('403')));

        await generateCleanupDeletions(ctx, plan(), { requireDeletion: false });

        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('TSTKDEL1', 'TST');
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('R3TR PROG ZOLD'), { important: true });
        expect(ctx.runtime.deletions.tadir).toBeUndefined();
    });

    test('an uninstall requires the deletion', async () => {
        const ctx = backedUp(context([]));
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(new MockTransport('TSTKDEL1'));
        const error = new RegistryDeletionTransportUnavailableError('endpoint', 'denied', new Error('401'));
        ctx.rawInput.packageData.registry.delete.mockRejectedValue(error);

        await expect(generateCleanupDeletions(ctx, plan(), { requireDeletion: true })).rejects.toBe(error);
    });
});

describe('cleanup revert', () => {
    test('deletion dummies are deleted while possible, otherwise taken out of the queue; every one is attempted', async () => {
        const unreleased = new MockTransport('TSTKDEL1');
        unreleased.canBeDeleted.mockResolvedValue(true);
        const released = new MockTransport('TSTKDEL2');
        const failing = new MockTransport('TSTKDEL3');
        failing.canBeDeleted.mockRejectedValue(new Error('read failed'));
        const ctx = context([]);
        ctx.revert.deletionDummies = [unreleased, released, failing];

        await expect(revertCleanupDeletions(ctx)).rejects.toThrow('read failed');

        expect(unreleased.delete).toHaveBeenCalled();
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('TSTKDEL2', 'TST');
    });

    test('backups are re-imported after the local packages are recreated, each one attempted', async () => {
        const ctx = context([]);
        ctx.revert.cleanupTemporaryPackages = [{ devclass: '$ROOT', parentcl: '', dlvunit: 'LOCAL' }];
        ctx.revert.backup = {
            tadir: { binaries: { trkorr: 'TSTKBKP1', binaries: {} } },
            cust: { binaries: { trkorr: 'TSTKBKP2', binaries: {} } }
        };
        const order: string[] = [];
        (SystemConnector.createPackage as jest.Mock).mockImplementation(async () => { order.push('package'); });
        const restored = new MockTransport('X');
        restored.import.mockImplementationOnce(async () => { order.push('import'); return 12; }).mockImplementationOnce(async () => { order.push('import'); return 0; });
        (Transport.upload as jest.Mock).mockResolvedValue(restored);

        await expect(restoreCleanupBackups(ctx)).rejects.toThrow('Restore of transport TSTKBKP1');

        expect(order).toEqual(['package', 'import', 'import']);
        expect(Transport.upload).toHaveBeenCalledWith('TSTKBKP2', expect.anything());
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalled();
    });
});
