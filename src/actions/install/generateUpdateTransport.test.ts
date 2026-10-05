jest.mock('../../commons', () => ({
    PackageHierarchy: class {},
    packageDataFromTdevc: jest.fn((_source, overrides) => overrides)
}));

jest.mock('../../systemConnector', () => ({
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
        getDest: jest.fn(() => 'TST')
    }
}));

jest.mock('../../transport', () => {
    class MockTransport {
        static upload = jest.fn();
        static createToc = jest.fn();
        static getTransportIcon = jest.fn(() => 'TR');
        static instances: MockTransport[] = [];
        static deletable = false;
        static existing = new Set<string>();
        getE070 = jest.fn(async () => MockTransport.existing.has(this.trkorr) ? { trkorr: this.trkorr } : undefined);
        addObjectsFromTransport = jest.fn().mockResolvedValue(undefined);
        canBeDeleted = jest.fn(async () => MockTransport.deletable);
        delete = jest.fn().mockResolvedValue(undefined);
        addObjects = jest.fn().mockResolvedValue(undefined);
        release = jest.fn().mockResolvedValue(undefined);
        download = jest.fn(async () => ({ binaries: { header: Buffer.from(this.trkorr), data: Buffer.from('d') } }));
        removeComments = jest.fn().mockResolvedValue(undefined);
        addComment = jest.fn().mockResolvedValue(undefined);
        constructor(public trkorr: string) { MockTransport.instances.push(this); }
    }
    return { Transport: MockTransport, TrmTransportIdentifier: { CUST: 'CUST', LANG: 'LANG' } };
});

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { deleteTemporaryCleanupPackages, generateUpdateTransport } from './generateUpdateTransport';

function context() {
    return {
        revert: {
            cleanupTemporaryPackages: [
                { devclass: '$CHILD', parentcl: '$PARENT', dlvunit: 'LOCAL', tpclass: '' },
                { devclass: '$PARENT', parentcl: '', dlvunit: 'LOCAL', tpclass: '' }
            ],
            cleanupOriginalTadir: [
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE', devclass: '$PARENT', srcsystem: 'OLD' },
                { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_TWO', devclass: '$CHILD', srcsystem: 'OLD' }
            ],
            dele: {
                trkorr: 'DEVK9DELE', entries: undefined,
                binaries: { header: Buffer.from('h'), data: Buffer.from('d') }
            },
            deleImportStarted: true
        }
    } as any;
}

describe('generateUpdateTransport revert', () => {
    let restored: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        (Transport as any).instances.length = 0;
        (Transport as any).deletable = false;
        (Transport as any).existing.clear();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'success').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(SystemConnector, 'getDevclass').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'createPackage').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'getExistingObjects').mockImplementation(async objects => objects as any);
        jest.spyOn(SystemConnector, 'tadirInterface').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'deleteTemporaryPackage').mockResolvedValue(undefined);
        restored = { import: jest.fn().mockResolvedValue(undefined) };
        jest.spyOn(Transport, 'upload').mockResolvedValue(restored);
    });

    test('package recreation failure does not skip old payload and TADIR restoration', async () => {
        const ctx = context();
        (SystemConnector.createPackage as jest.Mock)
            .mockRejectedValueOnce(new Error('parent recreation failed'))
            .mockResolvedValueOnce(undefined);

        await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('parent recreation failed');

        expect(SystemConnector.createPackage).toHaveBeenCalledTimes(2);
        expect(Transport.upload).toHaveBeenCalledTimes(1);
        expect(restored.import).toHaveBeenCalledWith(false);
        expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(2);
    });

    test('one TADIR restoration failure does not skip remaining assignments', async () => {
        const ctx = context();
        (SystemConnector.tadirInterface as jest.Mock)
            .mockRejectedValueOnce(new Error('first assignment failed'))
            .mockResolvedValueOnce(undefined);

        await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('first assignment failed');

        expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(2);
        expect(Transport.upload).toHaveBeenCalledTimes(1);
    });

    test('deletable, not-yet-imported deletion request is removed instead of restored', async () => {
        const ctx = context();
        (Transport as any).deletable = true;

        await generateUpdateTransport.revert(ctx);
        const deletionTransport = (Transport as any).instances[0];

        expect(deletionTransport.delete).toHaveBeenCalledTimes(1);
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('old deletion payload restoration failure still attempts TADIR restoration', async () => {
        const ctx = context();
        restored.import.mockRejectedValue(new Error('payload restore failed'));

        await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('payload restore failed');

        expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(2);
    });

    test('deletes the tracked upgrade cleanup request when failure happens before its snapshot', async () => {
        const ctx = context();
        ctx.revert.dele = undefined;
        ctx.revert.cleanupTemporaryPackages = [];
        ctx.revert.cleanupOriginalTadir = [];
        const tracked = new Transport('DEVK9TRACKED') as any;
        tracked.canBeDeleted.mockResolvedValue(true);
        ctx.revert.updateCleanupTransport = tracked;

        await generateUpdateTransport.revert(ctx);

        expect(tracked.canBeDeleted).toHaveBeenCalledTimes(1);
        expect(tracked.delete).toHaveBeenCalledTimes(1);
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('tracks the upgrade cleanup request before the next await can fail', async () => {
        const dummy = new Transport('DEVK9TRACKED') as any;
        dummy.canBeDeleted.mockResolvedValue(true);
        jest.spyOn(Transport, 'createToc').mockResolvedValue(dummy);
        const ctx = {
            rawInput: { packageData: { name: 'pkg', registry: {} } },
            runtime: {
                stopWarningShown: true,
                update: {
                    manifest: { get: () => ({ version: '1.0.0' }) },
                    getTransport: () => ({ getE071: jest.fn().mockRejectedValue(new Error('read failed')) })
                }
            },
            revert: { sapPackages: [], cleanupTemporaryPackages: [], cleanupOriginalTadir: [] }
        } as any;

        await expect(generateUpdateTransport.run(ctx)).rejects.toThrow('read failed');
        expect(ctx.revert.updateCleanupTransport).toBe(dummy);

        await generateUpdateTransport.revert(ctx);
        expect(dummy.delete).toHaveBeenCalledTimes(1);
    });

    test('rejects cleanup lock conflicts before changing selected objects', async () => {
        const dummy = new Transport('DEVK9TRACKED') as any;
        dummy.canBeDeleted.mockResolvedValue(true);
        jest.spyOn(Transport, 'createToc').mockResolvedValue(dummy);
        const acquire = jest.fn().mockRejectedValue(new Error('object locked'));
        const ctx = {
            lockScope: { acquire },
            rawInput: {
                packageData: { name: 'pkg' },
                installData: { installDevclass: { replacements: [] } },
                contextData: { noInquirer: true }
            },
            runtime: {
                stopWarningShown: true,
                update: {
                    manifest: { get: () => ({ version: '1.0.0' }) },
                    getTransport: () => ({ getE071: async () => [{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_OLD' }], getE071K: async () => [] }),
                    getDevclass: () => undefined
                },
                transports: { tadir: { binaries: { entries: { tadir: [] } } } },
                previousInstallPackages: [],
                package: { hierarchy: { devclass: 'Z_ROOT', sub: [] } }
            },
            revert: { sapPackages: [], cleanupTemporaryPackages: [], cleanupOriginalTadir: [] }
        } as any;

        await expect(generateUpdateTransport.run(ctx)).rejects.toThrow('object locked');
        expect(acquire).toHaveBeenCalledWith([{ type: 'OBJECT', name: 'R3TR CLAS Z_OLD' }]);
        expect(SystemConnector.tadirInterface).not.toHaveBeenCalled();
        expect(ctx.revert.updateCleanupTransport).toBe(dummy);

        await generateUpdateTransport.revert(ctx);
        expect(dummy.delete).toHaveBeenCalledTimes(1);
    });

    test('temporary package deletion attempts every package and reports the first failure', async () => {
        (SystemConnector.deleteTemporaryPackage as jest.Mock)
            .mockRejectedValueOnce(new Error('first delete failed'))
            .mockResolvedValueOnce(undefined);

        await expect(deleteTemporaryCleanupPackages([
            { objName: '$ONE' }, { objName: '$TWO' }
        ])).rejects.toThrow('first delete failed');
        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenCalledTimes(2);
        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenNthCalledWith(2, '$TWO');
    });

    function runContext(previous: any[], incoming: any[]) {
        const dummy = new Transport('DEVK9DELE') as any;
        const backup = new Transport('DEVK9BKP') as any;
        // createToc is a factory jest.fn: drop queued values left by previous tests.
        (Transport.createToc as jest.Mock).mockReset();
        jest.spyOn(Transport, 'createToc')
            .mockResolvedValueOnce(dummy)
            .mockResolvedValueOnce(backup);
        jest.spyOn(SystemConnector, 'getObjectsLocks').mockResolvedValue([]);
        restored.import.mockResolvedValue(0);
        const acquire = jest.fn().mockResolvedValue(undefined);
        const ctx = {
            lockScope: { acquire },
            rawInput: {
                packageData: { name: 'pkg', registry: { delete: jest.fn(async (binaries: any) => binaries) } },
                installData: { installDevclass: { replacements: [] } },
                contextData: { noInquirer: true }
            },
            runtime: {
                stopWarningShown: true,
                update: {
                    manifest: { get: () => ({ version: '1.0.0' }) },
                    getTransport: () => ({ getE071: async () => previous, getE071K: async () => [] }),
                    getDevclass: () => undefined
                },
                transports: { tadir: { binaries: { entries: { tadir: incoming } } } },
                previousInstallPackages: [],
                package: { hierarchy: { devclass: 'Z_ROOT', sub: [] }, data: { manifest: { name: 'pkg' } } }
            },
            revert: { sapPackages: [], cleanupTemporaryPackages: [], cleanupOriginalTadir: [] }
        } as any;
        return { ctx, dummy, backup, acquire };
    }

    describe('customizing of the installed release', () => {
        function custContext(importData?: any) {
            const run = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }], []);
            run.ctx.rawInput.installData.import = importData;
            run.ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9CUST1', trmType: 'CUST' }];
            (Transport as any).existing.add('DEVK9CUST1');
            jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
            return run;
        }

        test('is deleted before the new customizing is imported', async () => {
            const { ctx, dummy } = custContext();

            await generateUpdateTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
        });

        test('is deleted without asking, even when prompts are enabled', async () => {
            const { ctx, dummy } = custContext();
            ctx.rawInput.contextData.noInquirer = false;
            const prompt = jest.spyOn(Inquirer, 'prompt');

            await generateUpdateTransport.run(ctx);

            expect(prompt).not.toHaveBeenCalled();
            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
        });

        test('is kept when the new customizing is not imported', async () => {
            const { ctx, dummy } = custContext({ noCust: true });

            await generateUpdateTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('customizing of the installed release is kept'));
        });

    });

    test('tables still shipped by the new release are kept and backed up instead of deleted', async () => {
        const { ctx, dummy, backup, acquire } = runContext([
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT' },
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_GONE' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }
        ], [
            { pgmid: 'R3TR', object: 'TABL', objName: 'z_kept', devclass: 'Z_ROOT' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS', devclass: 'Z_ROOT' }
        ]);

        await generateUpdateTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => o.objName));
        expect(deleted).toEqual(['Z_GONE', 'Z_CLASS']);
        expect(acquire.mock.calls[0][0].map((lock: any) => lock.name)).not.toContain('R3TR TABL Z_KEPT');
        expect((SystemConnector.getObjectsLocks as jest.Mock).mock.calls[0][0].map((o: any) => o.OBJ_NAME)).not.toContain('Z_KEPT');
        expect(backup.addObjects).toHaveBeenCalledWith([{ pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT' }], false);
        expect(backup.release).toHaveBeenCalledWith(false, true);
        expect(ctx.revert.updateTablesBackupTransport).toBe(backup);
        expect(ctx.revert.retainedTables).toEqual({ trkorr: 'DEVK9BKP', entries: undefined, binaries: expect.any(Object) });
    });

    test('no backup transport is created when no table is retained', async () => {
        const { ctx, backup } = runContext([
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_GONE' }
        ], []);

        await generateUpdateTransport.run(ctx);

        expect(Transport.createToc).toHaveBeenCalledTimes(1);
        expect(backup.addObjects).not.toHaveBeenCalled();
        expect(ctx.revert.retainedTables).toBeUndefined();
    });

    test('tracks the table backup request before its release can fail', async () => {
        const { ctx, backup } = runContext([
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT' }
        ], [
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT', devclass: 'Z_ROOT' }
        ]);
        backup.release.mockRejectedValue(new Error('backup release failed'));
        backup.canBeDeleted.mockResolvedValue(true);

        await expect(generateUpdateTransport.run(ctx)).rejects.toThrow('backup release failed');
        expect(ctx.revert.updateTablesBackupTransport).toBe(backup);
        expect(ctx.revert.retainedTables).toBeUndefined();

        await generateUpdateTransport.revert(ctx);
        expect(backup.delete).toHaveBeenCalledTimes(1);
        expect(Transport.upload).not.toHaveBeenCalledWith('DEVK9BKP', expect.anything());
    });

    test('retained tables restore failure does not skip deletion payload and TADIR restoration', async () => {
        const ctx = context();
        ctx.revert.retainedTables = {
            trkorr: 'DEVK9BKP', entries: undefined,
            binaries: { header: Buffer.from('h'), data: Buffer.from('d') }
        };
        restored.import
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('tables restore failed'));

        await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('tables restore failed');

        expect(Transport.upload).toHaveBeenNthCalledWith(1, 'DEVK9DELE', expect.anything());
        expect(Transport.upload).toHaveBeenNthCalledWith(2, 'DEVK9BKP', expect.anything());
        expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(2);
    });

    test('deletion payload restore failure still restores retained tables', async () => {
        const ctx = context();
        ctx.revert.retainedTables = {
            trkorr: 'DEVK9BKP', entries: undefined,
            binaries: { header: Buffer.from('h'), data: Buffer.from('d') }
        };
        restored.import
            .mockRejectedValueOnce(new Error('payload restore failed'))
            .mockResolvedValueOnce(undefined);

        await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('payload restore failed');

        expect(Transport.upload).toHaveBeenNthCalledWith(2, 'DEVK9BKP', expect.anything());
        expect(restored.import).toHaveBeenCalledTimes(2);
        expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(2);
    });

    test('retained tables of a local package are staged for backup and moved back before cleanup', async () => {
        const { ctx, dummy, backup } = runContext([
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_GONE' }
        ], [
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT', devclass: 'Z_ROOT' }
        ]);
        ctx.runtime.update.getDevclass = () => '$OLD';
        jest.spyOn(SystemConnector, 'getSubpackages').mockResolvedValue([]);
        jest.spyOn(SystemConnector, 'getDevclassObjects').mockResolvedValue([]);
        jest.spyOn(SystemConnector, 'getDefaultTransportLayer').mockResolvedValue('ZTRL');
        jest.spyOn(SystemConnector, 'getExistingObjects').mockImplementation(async objects =>
            objects.map(object => ({ ...object, devclass: '$OLD', srcsystem: 'OLD' })) as any);
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass =>
            devclass === '$OLD' ? { devclass: '$OLD', parentcl: '' } : undefined);

        await generateUpdateTransport.run(ctx);

        const staging = ctx.revert.sapPackages[0];
        const assignments = (SystemConnector.tadirInterface as jest.Mock).mock.calls.map(([o]) => `${o.objName}:${o.devclass}`);
        expect(assignments).toEqual([
            `${staging}:${staging}`,
            `Z_GONE:${staging}`,
            `Z_KEPT:${staging}`,
            'Z_KEPT:$OLD'
        ]);
        expect(backup.addObjects).toHaveBeenCalledWith([{ pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT' }], false);
        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => o.objName));
        expect(deleted).not.toContain('Z_KEPT');
        expect(ctx.revert.cleanupOriginalTadir.map((o: any) => o.objName)).toEqual(['Z_GONE', 'Z_KEPT']);
    });
});
