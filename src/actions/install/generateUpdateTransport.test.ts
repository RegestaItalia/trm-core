jest.mock('../../commons', () => ({
    PackageHierarchy: class {},
    packageDataFromTdevc: jest.fn((_source, overrides) => overrides),
    getPackageNamespace: jest.fn((devclass: string) => devclass.startsWith('/') ? devclass.substring(0, devclass.indexOf('/', 1) + 1) : '')
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
        getNamespace: jest.fn(),
        getNamespacePackages: jest.fn(),
        addNamespace: jest.fn(),
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
        static customizingKeys: Record<string, { table: string, tabkey?: string }[]> = {};
        getCustomizingKeys = jest.fn(async () => MockTransport.customizingKeys[this.trkorr] || [{ table: 'ZCUST_TABLE', tabkey: '100K1' }]);
        canBeDeleted = jest.fn(async () => MockTransport.deletable);
        delete = jest.fn().mockResolvedValue(undefined);
        addObjects = jest.fn().mockResolvedValue(undefined);
        release = jest.fn().mockResolvedValue(undefined);
        download = jest.fn(async () => ({ binaries: { header: Buffer.from(this.trkorr), data: Buffer.from('d') } }));
        removeComments = jest.fn().mockResolvedValue(undefined);
        addComment = jest.fn().mockResolvedValue(undefined);
        constructor(public trkorr: string) { MockTransport.instances.push(this); }
    }
    return { Transport: MockTransport, TrmTransportIdentifier: { CUST: 'CUST', LANG: 'LANG' }, getE071KOwner: jest.requireActual('../../transport/E071KOwner').getE071KOwner };
});

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileSystem, RegistryDeletionTransportUnauthorizedError, RegistryType } from '../../registry';
import { isDeletionForwardable } from '../commons/utils';
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

    describe('after the cleanup of the imported objects failed', () => {
        function failedCleanupContext() {
            const ctx = context();
            ctx.revert.cleanupImported = true;
            ctx.revert.cleanupSucceeded = false;
            ctx.revert.retainedTables = {
                trkorr: 'DEVK9BKP', entries: undefined,
                binaries: { header: Buffer.from('bh'), data: Buffer.from('bd') }
            };
            jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
            return ctx;
        }

        test('does not restore the previous release over objects that were not deleted', async () => {
            const ctx = failedCleanupContext();

            await generateUpdateTransport.revert(ctx);

            expect(SystemConnector.createPackage).not.toHaveBeenCalled();
            expect(Transport.upload).not.toHaveBeenCalled();
            expect(SystemConnector.tadirInterface).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9DELE were not restored'), { important: true });
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9BKP was not restored'), { important: true });
        });

        test('still deletes the unreleased cleanup transports', async () => {
            const ctx = failedCleanupContext();
            ctx.revert.retainedTables = undefined;
            const backup = new Transport('DEVK9BKP') as any;
            backup.canBeDeleted.mockResolvedValue(true);
            ctx.revert.updateTablesBackupTransport = backup;
            (Transport as any).deletable = true;

            await generateUpdateTransport.revert(ctx);

            const deletionTransport = (Transport as any).instances.find((t: any) => t.trkorr === 'DEVK9DELE');
            expect(deletionTransport.delete).toHaveBeenCalledTimes(1);
            expect(backup.delete).toHaveBeenCalledTimes(1);
            expect(Transport.upload).not.toHaveBeenCalled();
        });

        test('restores everything when that cleanup succeeded', async () => {
            const ctx = failedCleanupContext();
            ctx.revert.cleanupSucceeded = true;

            await generateUpdateTransport.revert(ctx);

            expect(SystemConnector.createPackage).toHaveBeenCalledTimes(2);
            expect((Transport.upload as jest.Mock).mock.calls.map(([trkorr]) => trkorr)).toEqual(['DEVK9DELE', 'DEVK9BKP']);
            expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(2);
        });
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
            rawInput: { packageData: { name: 'pkg', registry: { getRegistryType: () => RegistryType.PRIVATE } } },
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
                packageData: { name: 'pkg', registry: { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn(async (binaries: any) => binaries) } },
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

        test('rows rewritten by the incoming customizing are deleted without asking', async () => {
            const { ctx, dummy } = custContext();
            ctx.rawInput.contextData.noInquirer = false;
            ctx.runtime.transports.cust = [{ binaries: { trkorr: 'DEVK9NEW', entries: { e071K: [{ objname: 'ZCUST_TABLE', tabkey: '100K1' }] } } }];
            const prompt = jest.spyOn(Inquirer, 'prompt');

            await generateUpdateTransport.run(ctx);

            expect(prompt).not.toHaveBeenCalled();
            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
        });

        test('rows no longer shipped by the incoming release are listed and confirmed', async () => {
            const { ctx, dummy } = custContext();
            ctx.rawInput.contextData.noInquirer = false;
            // K1 is shipped again, K2 no longer; the incoming release also ships the whole ZOTHER table.
            (Transport as any).customizingKeys = { DEVK9CUST1: [
                { table: 'ZCUST_TABLE', tabkey: '100K1' }, { table: 'ZCUST_TABLE', tabkey: '100K2' }, { table: 'ZOTHER', tabkey: '100X' }
            ] };
            ctx.runtime.transports.cust = [{ binaries: { trkorr: 'DEVK9NEW', entries: {
                e071K: [{ objname: 'ZCUST_TABLE', tabkey: '100K1' }],
                e071: [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZOTHER', objfunc: '' }]
            } } }];
            const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ deleteCustomizing: true });

            await generateUpdateTransport.run(ctx);
            (Transport as any).customizingKeys = {};

            expect(Logger.warning).toHaveBeenCalledWith('1 customizing row shipped by pkg v1.0.0 will be deleted (not shipped by the new release):\nZCUST_TABLE 100K2', { important: true });
            expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteCustomizing', default: true }));
            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
        });

        test('a generic key is confirmed even when the incoming release ships customizing', async () => {
            const { ctx } = custContext();
            ctx.rawInput.contextData.noInquirer = false;
            ctx.runtime.transports.cust = [{ binaries: { trkorr: 'DEVK9NEW', entries: { e071K: [{ objname: 'ZCUST_TABLE', tabkey: '100K1' }] } } }];
            (Transport as any).customizingKeys = { DEVK9CUST1: [{ table: 'ZCUST_TABLE', tabkey: '100*' }] };
            jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ deleteCustomizing: false });

            await expect(generateUpdateTransport.run(ctx)).rejects.toThrow('Update aborted.');
            (Transport as any).customizingKeys = {};
        });

        test('is kept when the new customizing is not imported', async () => {
            const { ctx, dummy } = custContext({ noCust: true });

            await generateUpdateTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('customizing of the installed release is kept'), { important: true });
        });

        test('is kept when the user declined to import a customizing transport of the new release', async () => {
            const { ctx, dummy } = custContext({});
            ctx.runtime.skippedCust = ['DEVK9CUST2'];

            await generateUpdateTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith('Customizing transports are skipped (DEVK9CUST2): the customizing of the installed release is kept.', { important: true });
        });

    });

    test('a local (.trm) release that cannot generate a deletion transport only warns: the upgrade continues', async () => {
        const { ctx, dummy } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_GONE' }], []);
        ctx.runtime.update.getDevclass = () => 'Z_ROOT';
        jest.spyOn(SystemConnector, 'getSubpackages').mockResolvedValue([]);
        jest.spyOn(SystemConnector, 'getDevclassObjects').mockResolvedValue([]);
        ctx.rawInput.packageData.registry.delete = (tocBinaries: any) => new FileSystem(join(tmpdir(), 'package.trm')).delete(tocBinaries);
        const warning = jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);

        await expect(generateUpdateTransport.run(ctx)).resolves.toBeUndefined();

        expect(warning).toHaveBeenCalledWith(expect.stringContaining("Local packages (.trm files) can't generate deletion transports."), { important: true });
        expect(dummy.delete).not.toHaveBeenCalled();
        expect(Transport.upload).not.toHaveBeenCalled();
        expect(isDeletionForwardable(ctx)).toBe(false);
    });

    test('an unauthorized deletion transport only warns: the upgrade continues without forwarding it', async () => {
        const { ctx, dummy } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_GONE' }], []);
        ctx.runtime.update.getDevclass = () => 'Z_ROOT';
        jest.spyOn(SystemConnector, 'getSubpackages').mockResolvedValue([]);
        jest.spyOn(SystemConnector, 'getDevclassObjects').mockResolvedValue([]);
        ctx.rawInput.packageData.registry.delete = jest.fn().mockRejectedValue(
            new RegistryDeletionTransportUnauthorizedError('endpoint', new Error('401')));
        // Deleting the released transport would fail: it must not be attempted.
        dummy.delete.mockRejectedValue(new Error('Request DEVK9DELE is released'));
        const warning = jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);

        await expect(generateUpdateTransport.run(ctx)).resolves.toBeUndefined();

        expect(warning).toHaveBeenCalledWith(expect.stringContaining('not authorized to generate deletion transports'), { important: true });
        expect(dummy.release).toHaveBeenCalled();
        expect(dummy.delete).not.toHaveBeenCalled();
        expect(Transport.upload).not.toHaveBeenCalled();
        expect(ctx.revert.dele).toBeUndefined();
        expect(isDeletionForwardable(ctx)).toBe(false);

        // A later rollback has nothing to restore from the never-imported transport.
        await generateUpdateTransport.revert(ctx);
        expect(dummy.delete).not.toHaveBeenCalled();
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    describe('namespace of the installed release', () => {
        function nspcContext(keptDevclass: string) {
            const run = runContext([
                { pgmid: 'R3TR', object: 'CLAS', objName: '/NS/GONE' },
                { pgmid: 'R3TR', object: 'NSPC', objName: '/NS/' }
            ], []);
            run.ctx.rawInput.installData.installDevclass.replacements = [{ installDevclass: keptDevclass }];
            run.ctx.runtime.update.getDevclass = () => '/NS/ROOT';
            run.ctx.runtime.previousInstallPackages = [{ originalDevclass: '/NS/ROOT', installDevclass: '/NS/ROOT' }];
            jest.spyOn(SystemConnector, 'getSubpackages').mockResolvedValue([]);
            jest.spyOn(SystemConnector, 'getDevclassObjects').mockResolvedValue([]);
            jest.spyOn(SystemConnector, 'getNamespace').mockResolvedValue({ namespace: '/NS/' } as any);
            jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
            return run;
        }

        test('is kept when the incoming release uses it, even when no package is left in it yet', async () => {
            const { ctx, dummy } = nspcContext('/NS/NEW_ROOT');
            jest.spyOn(SystemConnector, 'getNamespacePackages').mockResolvedValue([{ devclass: '/NS/ROOT' }] as any);

            await generateUpdateTransport.run(ctx);

            const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
            expect(deleted).toEqual(['CLAS /NS/GONE', 'DEVC /NS/ROOT']);
            expect(SystemConnector.getNamespacePackages).not.toHaveBeenCalled();
        });

        test('is deleted with its last package when the incoming release moves to another namespace', async () => {
            const { ctx, dummy } = nspcContext('Z_NEW_ROOT');
            jest.spyOn(SystemConnector, 'getNamespacePackages').mockResolvedValue([{ devclass: '/NS/ROOT' }] as any);

            await generateUpdateTransport.run(ctx);

            const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
            expect(deleted).toEqual(['CLAS /NS/GONE', 'DEVC /NS/ROOT', 'NSPC /NS/']);
        });
    });

    test('an installed object moved to a customer package and shipped again is left to the import, without asking', async () => {
        const moved = { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' };
        const { ctx, dummy } = runContext([moved, { pgmid: 'R3TR', object: 'PROG', objName: 'Z_OLD' }], [{ ...moved, devclass: 'Z_ROOT' }]);
        ctx.rawInput.contextData.noInquirer = false;
        jest.spyOn(SystemConnector, 'getExistingObjects').mockImplementation(async objects =>
            objects.filter((o: any) => o.objName === 'Z_MOVED').map((o: any) => ({ ...o, devclass: 'Z_CUSTOMER' })) as any);
        const prompt = jest.spyOn(Inquirer, 'prompt');

        await generateUpdateTransport.run(ctx);

        expect(prompt).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteMovedObjects' }));
        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted).toContain('PROG Z_OLD');
        expect(deleted).not.toContain('PROG Z_MOVED');
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
        expect(ctx.revert.retainedTableObjects).toEqual([{ pgmid: 'R3TR', object: 'TABL', objName: 'Z_KEPT' }]);
    });

    describe('local (.trm) upgrades', () => {
        test('are not skipped', async () => {
            const { ctx } = runContext([], []);
            ctx.runtime.isLocal = true;

            await expect(generateUpdateTransport.filter(ctx)).resolves.toBe(true);
        });

        test('first installs are still skipped', async () => {
            const { ctx } = runContext([], []);
            ctx.runtime.isLocal = true;
            ctx.runtime.update = undefined;

            await expect(generateUpdateTransport.filter(ctx)).resolves.toBe(false);
        });

        test('remove obsolete objects through the registry the artifact was published to', async () => {
            const { ctx, dummy } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_GONE' }], []);
            const realRegistry = { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn(async (binaries: any) => binaries) };
            const fileRegistry = {
                getRegistryType: () => RegistryType.LOCAL,
                getRealRegistry: jest.fn().mockResolvedValue(realRegistry),
                delete: jest.fn().mockRejectedValue(new Error("File system can't generate deletion transports!"))
            };
            ctx.runtime.isLocal = true;
            ctx.rawInput.packageData.registry = fileRegistry;

            await generateUpdateTransport.run(ctx);

            const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => o.objName));
            expect(deleted).toEqual(['Z_GONE']);
            expect(fileRegistry.delete).not.toHaveBeenCalled();
            expect(realRegistry.delete).toHaveBeenCalledTimes(1);
        });
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

        const staging = ctx.revert.stagingPackages[0];
        expect(staging).toMatch(/^ZTRM_DELE_/);
        // Not an install package: the rollback of the imported objects must not transport it.
        expect(ctx.revert.sapPackages).toEqual([]);
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
    describe('staging package of a local installation', () => {
        function stagingRevertContext() {
            const ctx = context();
            ctx.rawInput = { packageData: { name: 'pkg', registry: { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn(async (binaries: any) => binaries) } } };
            ctx.runtime = { update: { manifest: { get: () => ({ version: '1.0.0' }) } } };
            ctx.revert.sapPackages = [];
            ctx.revert.stagingPackages = ['ZTRM_DELE_ONE'];
            (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass =>
                devclass === 'ZTRM_DELE_ONE' ? { devclass } : undefined);
            jest.spyOn(SystemConnector, 'getDevclassObjects').mockResolvedValue([]);
            (Transport.createToc as jest.Mock).mockReset();
            (Transport.createToc as jest.Mock).mockImplementation(async () => new Transport('DEVK9STAGE'));
            jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
            return ctx;
        }

        function stagedDeletions(): string[] {
            return (Transport as any).instances
                .filter((t: any) => t.trkorr === 'DEVK9STAGE')
                .flatMap((t: any) => t.addObjects.mock.calls.map(([objects]: any[]) => objects[0].objName));
        }

        test('is deleted after a complete restore', async () => {
            const ctx = stagingRevertContext();

            await generateUpdateTransport.revert(ctx);

            expect(stagedDeletions()).toEqual(['ZTRM_DELE_ONE']);
            expect(ctx.rawInput.packageData.registry.delete).toHaveBeenCalledTimes(1);
            const tadirOrder = Math.max(...(SystemConnector.tadirInterface as jest.Mock).mock.invocationCallOrder);
            expect(tadirOrder).toBeLessThan((Transport.createToc as jest.Mock).mock.invocationCallOrder[0]);
        });

        test('deletes the namespaces imported for the staging after its packages', async () => {
            const ctx = stagingRevertContext();
            ctx.revert.temporaryNamespaces = ['/X/'];
            (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ trnspacet: {} });
            (SystemConnector.getNamespacePackages as jest.Mock).mockResolvedValue([]);

            await generateUpdateTransport.revert(ctx);

            expect(stagedDeletions()).toEqual(['ZTRM_DELE_ONE', '/X/']);
            expect(ctx.rawInput.packageData.registry.delete).toHaveBeenCalledTimes(2);
        });

        test('keeps an imported namespace still used by a package, and surfaces it', async () => {
            const ctx = stagingRevertContext();
            ctx.revert.temporaryNamespaces = ['/X/'];
            (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ trnspacet: {} });
            (SystemConnector.getNamespacePackages as jest.Mock).mockResolvedValue([{ devclass: '/X/OTHER' }]);

            await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('Namespace /X/ is still used by SAP packages /X/OTHER');

            expect(stagedDeletions()).toEqual(['ZTRM_DELE_ONE']);
        });

        test('is kept when restoring object assignments fails', async () => {
            const ctx = stagingRevertContext();
            (SystemConnector.tadirInterface as jest.Mock).mockRejectedValue(new Error('assignment failed'));

            await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('assignment failed');

            expect(Transport.createToc).not.toHaveBeenCalled();
        });

        test('is kept when the cleanup of the imported objects failed', async () => {
            const ctx = stagingRevertContext();
            ctx.revert.cleanupImported = true;
            ctx.revert.cleanupSucceeded = false;

            await generateUpdateTransport.revert(ctx);

            expect(Transport.createToc).not.toHaveBeenCalled();
        });

        test('is kept, and the failure surfaced, when objects are still assigned to it', async () => {
            const ctx = stagingRevertContext();
            (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_LEFT' }]);

            await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('ZTRM_DELE_ONE still contains 1 objects');

            expect(Transport.createToc).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Could not delete SAP package ZTRM_DELE_ONE'), { important: true });
        });

        test('a failed deletion transport is deleted when still possible and the failure surfaced', async () => {
            const ctx = stagingRevertContext();
            ctx.rawInput.packageData.registry.delete.mockRejectedValue(new Error('registry down'));
            const stage = new Transport('DEVK9STAGE') as any;
            stage.canBeDeleted.mockResolvedValue(true);
            (Transport.createToc as jest.Mock).mockReset();
            (Transport.createToc as jest.Mock).mockResolvedValue(stage);

            await expect(generateUpdateTransport.revert(ctx)).rejects.toThrow('registry down');

            expect(stage.delete).toHaveBeenCalledTimes(1);
        });

        test('already deleted by the deletion transport is skipped', async () => {
            const ctx = stagingRevertContext();
            (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);

            await generateUpdateTransport.revert(ctx);

            expect(Transport.createToc).not.toHaveBeenCalled();
        });

        test('left by an unauthorized deletion transport is reported for manual cleanup', async () => {
            const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_GONE' }], []);
            ctx.runtime.update.getDevclass = () => '$OLD';
            jest.spyOn(SystemConnector, 'getSubpackages').mockResolvedValue([]);
            jest.spyOn(SystemConnector, 'getDevclassObjects').mockResolvedValue([]);
            jest.spyOn(SystemConnector, 'getDefaultTransportLayer').mockResolvedValue('ZTRL');
            jest.spyOn(SystemConnector, 'getExistingObjects').mockImplementation(async objects =>
                objects.map(object => ({ ...object, devclass: '$OLD', srcsystem: 'OLD' })) as any);
            ctx.rawInput.packageData.registry.delete = jest.fn().mockRejectedValue(
                new RegistryDeletionTransportUnauthorizedError('endpoint', new Error('401')));
            (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass =>
                devclass === '$OLD' ? { devclass: '$OLD', parentcl: '' } : undefined);
            const warning = jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);

            await expect(generateUpdateTransport.run(ctx)).resolves.toBeUndefined();

            const staging = ctx.revert.stagingPackages[0];
            expect(warning).toHaveBeenCalledWith(expect.stringContaining(`SAP package(s) ${staging}, created for the cleanup, were left on TST`), { important: true });
            expect(SystemConnector.tadirInterface).toHaveBeenLastCalledWith(expect.objectContaining({ objName: 'Z_GONE', devclass: '$OLD' }));
        });
    });
});
