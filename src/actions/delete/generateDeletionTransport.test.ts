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
        static existing = new Set<string>();
        getE070 = jest.fn(async () => MockTransport.existing.has(this.trkorr) ? { trkorr: this.trkorr } : undefined);
        addObjectsFromTransport = jest.fn().mockResolvedValue(undefined);
        canBeDeleted = jest.fn(async () => false);
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
import { RegistryDeletionTransportUnauthorizedError, RegistryType } from '../../registry';
import { generateDeletionTransport } from './generateDeletionTransport';
import { getInstalledObjectsLocks } from '../commons/utils';

function runContext(previous: any[], devclass = 'Z_ROOT', keyed: any[] = []) {
    const dummy = new Transport('DEVK9DELE') as any;
    (Transport.createToc as jest.Mock).mockReset();
    (Transport.createToc as jest.Mock).mockResolvedValueOnce(dummy);
    const acquire = jest.fn().mockResolvedValue(undefined);
    const registry = { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn(async (binaries: any) => binaries) };
    const ctx = {
        lockScope: { acquire },
        rawInput: {
            packageData: { name: 'pkg', registry },
            contextData: { noInquirer: true },
            deleteData: { checks: {} }
        },
        runtime: {
            stopWarningShown: true,
            update: {
                manifest: { get: () => ({ name: 'pkg', version: '1.0.0' }) },
                getTransport: () => ({ getE071: async () => previous, getE071K: async () => keyed }),
                getDevclass: () => devclass
            },
            previousInstallPackages: [{ originalDevclass: 'Z_ORIG', installDevclass: devclass }],
            previousInstallTransports: []
        },
        revert: { sapPackages: [] },
        output: { manifest: { name: 'pkg' } }
    } as any;
    return { ctx, dummy, acquire, registry };
}

describe('generateDeletionTransport', () => {
    let imported: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        (Transport as any).instances.length = 0;
        (Transport as any).existing.clear();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'success').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.createPackage as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects);
        (SystemConnector.tadirInterface as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue(undefined);
        imported = { trkorr: 'DEVK9DELE', import: jest.fn().mockResolvedValue(0) };
        (Transport.upload as jest.Mock).mockResolvedValue(imported);
    });

    test('deletes every installed object and the installed SAP packages', async () => {
        const { ctx, dummy } = runContext([
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_TABLE' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }
        ]);

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        // No incoming release: tables are dropped and not backed up.
        expect(deleted).toEqual(['TABL Z_TABLE', 'CLAS Z_CLASS', 'DEVC Z_ROOT']);
        expect(Transport.createToc).toHaveBeenCalledTimes(1);
        expect(ctx.revert.retainedTables).toBeUndefined();
        expect(dummy.addComment).toHaveBeenCalledWith('name=pkg');
        expect(dummy.addComment).toHaveBeenCalledWith('version=1.0.0');
        expect(imported.import).toHaveBeenCalledWith(false);
        expect(ctx.output.transport).toBe(imported);
    });

    test('objects deleted by the nested package deletes are not deleted again', async () => {
        const { ctx, dummy } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        // The SAP buffers still list the nested package and its objects after their deletion.
        ctx.runtime.deletedObjects = [
            { pgmid: 'R3TR', object: 'DEVC', objName: 'Z_NESTED' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_NESTED_CLASS' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_STALE' }
        ];
        (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === 'Z_ROOT' ? [{ devclass: 'Z_NESTED', parentcl: 'Z_ROOT' }] : []);
        (SystemConnector.getDevclassObjects as jest.Mock).mockImplementation(async (devclass: string) => devclass === 'Z_ROOT'
            ? [
                { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS', devclass },
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_STALE', devclass },
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL', devclass }
            ]
            : [{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_NESTED_CLASS', devclass }]);

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted.sort()).toEqual(['CLAS Z_CLASS', 'DEVC Z_ROOT', 'PROG Z_LOCAL']);
        expect(SystemConnector.getDevclassObjects).not.toHaveBeenCalledWith('Z_NESTED', false);
    });

    test('a local package that cannot be deleted is left empty with a warning', async () => {
        const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }], '$LOCAL');
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === '$LOCAL' ? { devclass, dlvunit: 'LOCAL' } : undefined);
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue('ZTST');
        (SystemConnector.deleteTemporaryPackage as jest.Mock).mockRejectedValue(new Error('package API failed'));

        await generateDeletionTransport.run(ctx);

        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenCalledWith('$LOCAL');
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Could not delete local SAP package(s) $LOCAL (package API failed)'), { important: true });
        expect(imported.import).toHaveBeenCalled();
    });

    test('objects of a missing namespace in a local package are staged in that namespace, imported for the delete', async () => {
        const { ctx, dummy } = runContext([
            { pgmid: 'R3TR', object: 'CLAS', objName: '/X/CL_A' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_PROG' }
        ], '$LOCAL');
        ctx.runtime.update.manifest.get = () => ({
            name: 'pkg', version: '1.0.0',
            namespace: { ns: '/X/', replicense: 'license', texts: [{ language: 'E', description: 'X', owner: 'owner' }] }
        });
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === '$LOCAL' ? { devclass, dlvunit: 'LOCAL' } : undefined);
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue('ZTST');
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects.map((o: any) => ({ ...o, devclass: '$LOCAL' })));
        (SystemConnector.deleteTemporaryPackage as jest.Mock).mockResolvedValue(undefined);

        await generateDeletionTransport.run(ctx);

        expect(SystemConnector.addNamespace).toHaveBeenCalledWith('/X/', 'license', [{ namespace: '/X/', spras: 'E', descriptn: 'X', owner: 'owner' }]);
        const staging: string[] = ctx.revert.stagingPackages;
        expect(staging).toHaveLength(2);
        const namespaceStaging = staging.find(o => o.startsWith('/X/TRMD_'));
        const plainStaging = staging.find(o => o.startsWith('ZTRM_DELE_'));
        expect(namespaceStaging.length).toBeLessThanOrEqual(30);
        expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(expect.objectContaining({ objName: '/X/CL_A', devclass: namespaceStaging }));
        expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(expect.objectContaining({ objName: 'Z_PROG', devclass: plainStaging }));
        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted).toEqual(expect.arrayContaining([`DEVC ${namespaceStaging}`, `DEVC ${plainStaging}`, 'NSPC /X/']));
        expect(ctx.revert.temporaryNamespaces).toEqual(['/X/']);
    });

    test('objects of a missing namespace without a known repair license abort before staging', async () => {
        const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: '/X/CL_A' }], '$LOCAL');
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === '$LOCAL' ? { devclass, dlvunit: 'LOCAL' } : undefined);
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects.map((o: any) => ({ ...o, devclass: '$LOCAL' })));

        await expect(generateDeletionTransport.run(ctx)).rejects.toThrow("Namespace /X/ doesn't exist in TST and its repair license is unknown");
        expect(SystemConnector.addNamespace).not.toHaveBeenCalled();
        expect(SystemConnector.createPackage).not.toHaveBeenCalled();
    });

    test('translation rows of the installed transport are not deletion entries', async () => {
        const { ctx, dummy } = runContext([
            { pgmid: 'R3TR', object: 'DTEL', objName: 'Z_DTEL' },
            // Landscape transport carrying the LANG transport: SAP rejects LANG rows in a deletion.
            { pgmid: 'LANG', object: 'DTED', objName: 'Z_DTEL' }
        ]);

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.pgmid} ${o.object} ${o.objName}`));
        expect(deleted).toEqual(['R3TR DTEL Z_DTEL', 'R3TR DEVC Z_ROOT']);
    });

    test('deletes the namespace together with its last package', async () => {
        const { ctx, dummy } = runContext([
            { pgmid: 'R3TR', object: 'CLAS', objName: '/NS/CLASS' }
        ], '/NS/ROOT');
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ namespace: '/NS/' });
        (SystemConnector.getNamespacePackages as jest.Mock).mockResolvedValue([{ devclass: '/NS/ROOT' }]);

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted).toEqual(['CLAS /NS/CLASS', 'DEVC /NS/ROOT', 'NSPC /NS/']);
    });

    test('keeps a namespace shipped by the installed transport while other SAP packages use it', async () => {
        const { ctx, dummy, acquire } = runContext([
            { pgmid: 'R3TR', object: 'CLAS', objName: '/NS/CLASS' },
            { pgmid: 'R3TR', object: 'NSPC', objName: '/NS/' }
        ], '/NS/ROOT');
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ namespace: '/NS/' });
        // /NS/OTHER is not a TRM package: TDEVC alone decides.
        (SystemConnector.getNamespacePackages as jest.Mock).mockResolvedValue([{ devclass: '/NS/ROOT' }, { devclass: '/NS/OTHER' }]);

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted).toEqual(['CLAS /NS/CLASS', 'DEVC /NS/ROOT']);
        expect(acquire.mock.calls[0][0].map((lock: any) => lock.name)).not.toContain('R3TR NSPC /NS/');
        expect(SystemConnector.getNamespacePackages).toHaveBeenCalledWith('/NS/');
    });

    test('deletes a namespace shipped by the installed transport once, with its last package', async () => {
        const { ctx, dummy } = runContext([
            { pgmid: 'R3TR', object: 'NSPC', objName: '/NS/' },
            { pgmid: 'R3TR', object: 'CLAS', objName: '/NS/CLASS' }
        ], '/NS/ROOT');
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ namespace: '/NS/' });
        (SystemConnector.getNamespacePackages as jest.Mock).mockResolvedValue([{ devclass: '/NS/ROOT' }]);

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted).toEqual(['CLAS /NS/CLASS', 'DEVC /NS/ROOT', 'NSPC /NS/']);
        expect(SystemConnector.getNamespacePackages).toHaveBeenCalledTimes(1);
    });

    test('keeps the namespace when its usage cannot be checked', async () => {
        const { ctx, dummy } = runContext([
            { pgmid: 'R3TR', object: 'CLAS', objName: '/NS/CLASS' },
            { pgmid: 'R3TR', object: 'NSPC', objName: '/NS/' }
        ], '/NS/ROOT');
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ namespace: '/NS/' });
        (SystemConnector.getNamespacePackages as jest.Mock).mockRejectedValue(new Error('RFC_READ_TABLE failed'));

        await generateDeletionTransport.run(ctx);

        const deleted = dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));
        expect(deleted).toEqual(['CLAS /NS/CLASS', 'DEVC /NS/ROOT']);
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Keeping namespace /NS/'), { important: true });
    });

    test('unauthorized deletion transport aborts the delete instead of only warning', async () => {
        const { ctx, dummy, registry } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        registry.delete.mockRejectedValue(new RegistryDeletionTransportUnauthorizedError('endpoint', new Error('401')));

        await expect(generateDeletionTransport.run(ctx)).rejects.toBeInstanceOf(RegistryDeletionTransportUnauthorizedError);
        expect(imported.import).not.toHaveBeenCalled();
        expect(ctx.output.transport).toBeUndefined();
        // Released: it can't be deleted, and it's neither restored nor forwarded.
        expect(dummy.delete).not.toHaveBeenCalled();
        expect(ctx.revert.dele).toBeUndefined();
    });

    test('unauthorized deletion is reported even when the released transport could not be deleted', async () => {
        const { ctx, dummy, registry } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        const authorizationError = new RegistryDeletionTransportUnauthorizedError('endpoint', new Error('401'));
        registry.delete.mockRejectedValue(authorizationError);
        dummy.delete.mockRejectedValue(new Error('Request DEVK9DELE is released'));

        await expect(generateDeletionTransport.run(ctx)).rejects.toBe(authorizationError);

        await generateDeletionTransport.revert(ctx);
        expect(dummy.delete).not.toHaveBeenCalled();
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('lock conflicts abort before any object is changed', async () => {
        const { ctx, dummy } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS', trkorr: 'DEVK9OPEN' }
        ]);

        await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('Delete aborted');
        expect(dummy.addObjects).not.toHaveBeenCalled();

        dummy.canBeDeleted.mockResolvedValue(true);
        await generateDeletionTransport.revert(ctx);
        expect(dummy.delete).toHaveBeenCalledTimes(1);
    });

    describe('rollback after the deletion transport was released', () => {
        test('a registry failure does not re-import the copy over the live objects', async () => {
            const { ctx, registry } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
            registry.delete.mockRejectedValue(new Error('registry 500'));

            await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('registry 500');
            expect(ctx.revert.dele).toBeDefined();
            expect(ctx.revert.deleImportStarted).toBeFalsy();

            await generateDeletionTransport.revert(ctx);
            expect(Transport.upload).not.toHaveBeenCalled();
        });

        test('a failed test import does not re-import the copy', async () => {
            const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
            imported.import.mockResolvedValueOnce(12);

            await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('Test import of deletion transport failed');
            expect(ctx.revert.deleImportStarted).toBeFalsy();

            (Transport.upload as jest.Mock).mockClear();
            await generateDeletionTransport.revert(ctx);
            expect(Transport.upload).not.toHaveBeenCalled();
        });

        test('a failed import re-imports the copy', async () => {
            const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
            imported.import.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('import failed'));

            await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('import failed');
            expect(ctx.revert.deleImportStarted).toBe(true);

            (Transport.upload as jest.Mock).mockClear();
            await generateDeletionTransport.revert(ctx);
            expect(Transport.upload).toHaveBeenCalledWith('DEVK9DELE', expect.anything());
        });
    });

    describe('customizing', () => {
        const objects = [
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' },
            // Landscape transport: CUST entries copied with their keys.
            { pgmid: 'R3TR', object: 'TABU', objName: 'ZCUST_TABLE' },
            // View maintenance entry: its keys point to the view's table.
            { pgmid: 'R3TR', object: 'VDAT', objName: 'ZCUST_VIEW' }
        ];
        const keys = [
            { pgmid: 'R3TR', object: 'TABU', objname: 'ZCUST_TABLE', mastertype: 'TABU', mastername: 'ZCUST_TABLE' },
            { pgmid: 'R3TR', object: 'TABU', objname: 'ZCUST_VIEW_TABLE', mastertype: 'VDAT', mastername: 'ZCUST_VIEW' }
        ];
        const deletedOf = (dummy: any) => dummy.addObjects.mock.calls.flatMap(([entries]: any[]) => entries.map((o: any) => `${o.object} ${o.objName}`));

        function custContext() {
            const run = runContext(objects, 'Z_ROOT', keys);
            run.ctx.runtime.previousInstallTransports = [
                { trkorr: 'DEVK9CUST1', trmType: 'CUST' },
                { trkorr: 'DEVK9LANG', trmType: 'LANG' }
            ];
            (Transport as any).existing.add('DEVK9CUST1');
            (Transport as any).existing.add('DEVK9LANG');
            return run;
        }

        test('rows of the recorded customizing transports are copied with their keys', async () => {
            const { ctx, dummy } = custContext();

            await generateDeletionTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).toHaveBeenCalledTimes(1);
            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
            expect(ctx.revert.cleanupCustomizingSources).toEqual(['DEVK9CUST1']);
            // Keyed entries are never added without their keys.
            expect(deletedOf(dummy)).toEqual(['CLAS Z_CLASS', 'DEVC Z_ROOT']);
            expect(SystemConnector.getObjectsLocks).toHaveBeenCalledWith(expect.not.arrayContaining([
                expect.objectContaining({ OBJ_NAME: 'ZCUST_TABLE' })
            ]));
            // Copied TRM comment rows are rebuilt after the copy.
            const copyOrder = dummy.addObjectsFromTransport.mock.invocationCallOrder[0];
            expect(copyOrder).toBeLessThan(dummy.removeComments.mock.invocationCallOrder[0]);
            expect(imported.import).toHaveBeenCalledWith(false);
        });

        test('no recorded customizing transports: nothing is copied', async () => {
            const { ctx, dummy } = runContext(objects, 'Z_ROOT', keys);

            await generateDeletionTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).not.toHaveBeenCalled();
            expect(deletedOf(dummy)).toEqual(['CLAS Z_CLASS', 'DEVC Z_ROOT']);
        });

        test('a recorded transport no longer on the system is skipped with a warning', async () => {
            const { ctx, dummy } = custContext();
            (Transport as any).existing.delete('DEVK9CUST1');

            await generateDeletionTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).not.toHaveBeenCalled();
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9CUST1 is no longer on TST'), { important: true });
        });

        test('the rows are deleted without asking, even when prompts are enabled', async () => {
            const { ctx, dummy } = custContext();
            ctx.rawInput.contextData.noInquirer = false;
            const prompt = jest.spyOn(Inquirer, 'prompt');

            await generateDeletionTransport.run(ctx);

            expect(prompt).not.toHaveBeenCalled();
            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
        });

        test('customizing alone still generates the deletion transport', async () => {
            const { ctx, dummy } = runContext([
                { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' },
                { pgmid: 'R3TR', object: 'TABU', objName: 'ZCUST_TABLE' }
            ], '', keys);
            ctx.runtime.previousInstallPackages = [];
            ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9CUST1', trmType: 'CUST' }];
            (Transport as any).existing.add('DEVK9CUST1');

            await generateDeletionTransport.run(ctx);

            expect(dummy.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST1');
            expect(dummy.release).toHaveBeenCalled();
        });

        test('a failed copy aborts before release and rollback deletes the transport', async () => {
            const { ctx, dummy, registry } = custContext();
            dummy.addObjectsFromTransport.mockRejectedValue(new Error('copy failed'));

            await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('copy failed');
            expect(dummy.release).not.toHaveBeenCalled();
            expect(registry.delete).not.toHaveBeenCalled();

            dummy.canBeDeleted.mockResolvedValue(true);
            await generateDeletionTransport.revert(ctx);
            expect(dummy.delete).toHaveBeenCalledTimes(1);
            expect(Transport.upload).not.toHaveBeenCalled();
        });

        test('a failed import re-imports the copy holding the customizing rows', async () => {
            const { ctx } = custContext();
            imported.import.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('import failed'));

            await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('import failed');
            expect(ctx.revert.deleImportStarted).toBe(true);

            (Transport.upload as jest.Mock).mockClear();
            await generateDeletionTransport.revert(ctx);
            expect(Transport.upload).toHaveBeenCalledWith('DEVK9DELE', expect.anything());
        });
    });

    describe('objects moved outside the installation', () => {
        function movedContext() {
            const run = runContext([
                { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' },
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' },
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_SUB' }
            ]);
            const devclasses: Record<string, string> = { Z_CLASS: 'Z_ROOT', Z_MOVED: 'Z_OTHER', Z_SUB: 'Z_ROOT_SUB' };
            (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async devclass =>
                devclass === 'Z_ROOT' ? [{ devclass: 'Z_ROOT_SUB', parentcl: 'Z_ROOT' }] : []);
            (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects =>
                objects.map((object: any) => ({ ...object, devclass: devclasses[object.objName] })));
            return run;
        }
        const deletedOf = (dummy: any) => dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));

        test('are kept without prompts', async () => {
            const { ctx, dummy } = movedContext();

            await generateDeletionTransport.run(ctx);

            expect(deletedOf(dummy)).toEqual(['CLAS Z_CLASS', 'PROG Z_SUB', 'DEVC Z_ROOT', 'DEVC Z_ROOT_SUB']);
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('PROG Z_MOVED was moved to SAP package Z_OTHER'));
            expect(SystemConnector.getObjectsLocks).toHaveBeenCalledWith(expect.not.arrayContaining([
                expect.objectContaining({ OBJ_NAME: 'Z_MOVED' })
            ]));
        });

        test('are deleted only when confirmed', async () => {
            const { ctx, dummy } = movedContext();
            ctx.rawInput.contextData.noInquirer = false;
            const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ deleteMovedObjects: true });

            await generateDeletionTransport.run(ctx);

            expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteMovedObjects', default: false }));
            expect(deletedOf(dummy)).toContain('PROG Z_MOVED');
        });

        test('a failed lookup aborts before any change and rollback deletes the transport', async () => {
            const { ctx, dummy, acquire } = movedContext();
            (SystemConnector.getExistingObjects as jest.Mock).mockRejectedValue(new Error('TADIR read failed'));

            await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('TADIR read failed');
            expect(acquire).not.toHaveBeenCalled();
            expect(dummy.addObjects).not.toHaveBeenCalled();

            (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects);
            dummy.canBeDeleted.mockResolvedValue(true);
            await generateDeletionTransport.revert(ctx);
            expect(dummy.delete).toHaveBeenCalledTimes(1);
        });
    });

    describe('SAP packages of other TRM packages', () => {
        // Shared with the upgrade cleanup; the delete action deletes nested packages first.
        function otherContext() {
            const run = runContext([
                { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' },
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_INTO_NESTED' }
            ]);
            // Z_ROOT -> Z_LOCAL -> Z_NESTED (other TRM package) -> Z_NESTED_SUB; Z_ROOT -> Z_EXTRA
            const parents: Record<string, string> = { Z_LOCAL: 'Z_ROOT', Z_NESTED: 'Z_LOCAL', Z_NESTED_SUB: 'Z_NESTED', Z_EXTRA: 'Z_ROOT' };
            (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async devclass => devclass === 'Z_ROOT'
                ? Object.entries(parents).map(([sub, parentcl]) => ({ devclass: sub, parentcl }))
                : []);
            (SystemConnector.getDevclassObjects as jest.Mock).mockImplementation(async devclass => ({
                Z_LOCAL: [{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL_PROG' }],
                Z_NESTED: [{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_NESTED_PROG' }],
                Z_NESTED_SUB: [{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_NESTED_SUB_PROG' }],
                Z_EXTRA: [{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_EXTRA_PROG' }]
            } as Record<string, any[]>)[devclass] || []);
            const devclasses: Record<string, string> = { Z_CLASS: 'Z_ROOT', Z_INTO_NESTED: 'Z_NESTED_SUB' };
            (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects =>
                objects.map((object: any) => ({ ...object, devclass: devclasses[object.objName] })));
            run.ctx.rawInput.contextData.systemPackages = [
                { packageName: 'pkg', getDevclass: () => 'Z_ROOT' },
                { packageName: 'nested', getDevclass: () => 'Z_NESTED' }
            ];
            return run;
        }
        const deletedOf = (dummy: any) => dummy.addObjects.mock.calls.flatMap(([objects]: any[]) => objects.map((o: any) => `${o.object} ${o.objName}`));

        test('are ignored: everything else is removed, their ancestors stay as packages', async () => {
            const { ctx, dummy } = otherContext();

            await generateDeletionTransport.run(ctx);

            const deleted = deletedOf(dummy);
            expect(deleted).toEqual(expect.arrayContaining(['CLAS Z_CLASS', 'PROG Z_LOCAL_PROG', 'PROG Z_EXTRA_PROG', 'DEVC Z_EXTRA']));
            expect(deleted).toHaveLength(4);
            // Without prompts, extra objects are deleted with a warning.
            expect(Logger.warning).toHaveBeenCalledWith('Cleanup of SAP package Z_EXTRA will delete 2 extra objects outside this installation.', { important: true });
            expect(Logger.warning).toHaveBeenCalledWith('Cleanup of SAP package Z_LOCAL will delete 2 extra objects outside this installation.', { important: true });
            expect(Logger.warning).not.toHaveBeenCalledWith(expect.stringContaining('nested'));
            expect(Logger.warning).not.toHaveBeenCalledWith(expect.stringContaining('NESTED'));
        });

        test('installed objects now in another TRM package are kept without asking', async () => {
            const { ctx, dummy } = otherContext();
            ctx.rawInput.contextData.noInquirer = false;
            const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ deleteExtraObjects: true });

            await generateDeletionTransport.run(ctx);

            expect(deletedOf(dummy)).not.toContain('PROG Z_INTO_NESTED');
            expect(prompt).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteMovedObjects' }));
        });

        test('nothing of theirs is deleted once the delete action removed them', async () => {
            const { ctx, dummy } = otherContext();
            // The nested delete already ran: its SAP packages are gone.
            ctx.rawInput.contextData.systemPackages = [ctx.rawInput.contextData.systemPackages[0]];
            (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async devclass => devclass === 'Z_ROOT'
                ? [{ devclass: 'Z_LOCAL', parentcl: 'Z_ROOT' }]
                : []);

            await generateDeletionTransport.run(ctx);

            expect(deletedOf(dummy)).toEqual(['CLAS Z_CLASS', 'PROG Z_LOCAL_PROG', 'DEVC Z_ROOT', 'DEVC Z_LOCAL']);
        });
    });

    test('nothing to delete only warns and does not generate a deletion transport', async () => {
        const { ctx, dummy, registry } = runContext([
            { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' }
        ], '');
        ctx.runtime.previousInstallPackages = [];
        dummy.canBeDeleted.mockResolvedValue(true);

        await generateDeletionTransport.run(ctx);

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Nothing to delete for package pkg'), { important: true });
        expect(dummy.addObjects).not.toHaveBeenCalled();
        expect(dummy.release).not.toHaveBeenCalled();
        expect(registry.delete).not.toHaveBeenCalled();
        expect(dummy.delete).toHaveBeenCalledTimes(1);
        expect(ctx.revert.updateCleanupTransport).toBeUndefined();
        expect(ctx.revert.dele).toBeUndefined();
        expect(ctx.output.transport).toBeUndefined();
    });

    test('nothing to delete still completes when the empty transport cannot be deleted', async () => {
        const { ctx, dummy } = runContext([], '');
        ctx.runtime.previousInstallPackages = [];
        dummy.canBeDeleted.mockResolvedValue(true);
        dummy.delete.mockRejectedValue(new Error('delete failed'));

        await generateDeletionTransport.run(ctx);

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Could not delete transport DEVK9DELE'), { important: true });
        expect(dummy.release).not.toHaveBeenCalled();
        // Rollback can still retry deleting it.
        expect(ctx.revert.updateCleanupTransport).toBe(dummy);
    });

    describe('revert', () => {
        function revertContext() {
            const { ctx } = runContext([]);
            ctx.revert.stagingPackages = ['ZTRM_DELE_ONE', 'ZTRM_DELE_TWO'];
            ctx.revert.dele = { trkorr: 'DEVK9DELE', entries: undefined, binaries: { header: Buffer.from('h'), data: Buffer.from('d') } };
            ctx.revert.deleImportStarted = true;
            ctx.revert.cleanupOriginalTadir = [
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE', devclass: '$LOCAL', srcsystem: 'OLD' }
            ];
            (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass => ({ devclass }));
            (Transport.createToc as jest.Mock).mockReset();
            (Transport.createToc as jest.Mock).mockImplementation(async () => new Transport('DEVK9STAGE'));
            return ctx;
        }

        test('restores the deleted objects and then removes the staging packages', async () => {
            const ctx = revertContext();

            await generateDeletionTransport.revert(ctx);

            expect(Transport.upload).toHaveBeenCalledWith('DEVK9DELE', expect.anything());
            expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(ctx.revert.cleanupOriginalTadir[0]);
            const staged = (Transport as any).instances
                .filter((t: any) => t.trkorr === 'DEVK9STAGE')
                .flatMap((t: any) => t.addObjects.mock.calls.map(([objects]: any[]) => objects[0].objName));
            expect(staged).toEqual(['ZTRM_DELE_ONE', 'ZTRM_DELE_TWO']);
            const tadirOrder = (SystemConnector.tadirInterface as jest.Mock).mock.invocationCallOrder[0];
            expect(tadirOrder).toBeLessThan((Transport.createToc as jest.Mock).mock.invocationCallOrder[0]);
        });

        test('keeps staging packages when restoring object assignments fails', async () => {
            const ctx = revertContext();
            (SystemConnector.tadirInterface as jest.Mock).mockRejectedValue(new Error('assignment failed'));

            await expect(generateDeletionTransport.revert(ctx)).rejects.toThrow('assignment failed');

            expect(Transport.createToc).not.toHaveBeenCalled();
        });

        test('restore failure still attempts the remaining restore operations', async () => {
            const ctx = revertContext();
            imported.import.mockRejectedValueOnce(new Error('payload restore failed'));

            await expect(generateDeletionTransport.revert(ctx)).rejects.toThrow('payload restore failed');

            expect(SystemConnector.tadirInterface).toHaveBeenCalledTimes(1);
            expect(Transport.createToc).not.toHaveBeenCalled();
        });

        test('one staging package failure does not skip the others', async () => {
            const ctx = revertContext();
            (SystemConnector.getDevclassObjects as jest.Mock)
                .mockResolvedValueOnce([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_LEFT' }])
                .mockResolvedValueOnce([]);

            await expect(generateDeletionTransport.revert(ctx)).rejects.toThrow('ZTRM_DELE_ONE still contains 1 objects');

            const staged = (Transport as any).instances
                .filter((t: any) => t.trkorr === 'DEVK9STAGE')
                .flatMap((t: any) => t.addObjects.mock.calls.map(([objects]: any[]) => objects[0].objName));
            expect(staged).toEqual(['ZTRM_DELE_TWO']);
        });

        test('a failed staging deletion transport is deleted when still possible', async () => {
            const ctx = revertContext();
            ctx.revert.stagingPackages = ['ZTRM_DELE_ONE'];
            ctx.rawInput.packageData.registry.delete.mockRejectedValue(new Error('registry down'));
            const stage = new Transport('DEVK9STAGE') as any;
            stage.canBeDeleted.mockResolvedValue(true);
            (Transport.createToc as jest.Mock).mockReset();
            (Transport.createToc as jest.Mock).mockResolvedValue(stage);

            await expect(generateDeletionTransport.revert(ctx)).rejects.toThrow('registry down');

            expect(stage.delete).toHaveBeenCalledTimes(1);
        });
    });
});

describe('getInstalledObjectsLocks', () => {
    function installed(previous: any[], devclass = 'Z_ROOT') {
        return {
            getTransport: () => ({ getE071: async () => previous, getE071K: async () => [] }),
            getDevclass: () => devclass
        } as any;
    }
    const mappings = [{ originalDevclass: 'Z_ORIG', installDevclass: 'Z_ROOT' }];

    beforeEach(() => {
        jest.clearAllMocks();
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([{ devclass: 'Z_NESTED', parentcl: 'Z_ROOT' }]);
        (SystemConnector.getObjectsLocks as jest.Mock).mockImplementation(async objects => objects.map((o: any) => ({
            pgmid: o.PGMID, object: o.OBJECT, objName: o.OBJ_NAME, trkorr: 'DEVK9EDIT'
        })));
        const devclasses: Record<string, string> = { Z_KEPT: 'Z_ROOT', Z_MOVED: 'Z_CUSTOM', Z_OTHER: 'Z_NESTED' };
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects
            .map((o: any) => ({ ...o, devclass: devclasses[o.objName] })));
    });

    test('only checks installed objects the cleanup deletes for sure', async () => {
        const pkg = installed([
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_OTHER' },
            { pgmid: 'LIMU', object: 'METH', objName: 'ZCL_X                         M' }
        ]);
        const nested = { packageName: 'nested', getDevclass: () => 'Z_NESTED' } as any;

        const locks = await getInstalledObjectsLocks(pkg, mappings, [pkg, nested], [
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT' },
            // Moved outside the installation, or into another TRM package: the cleanup may keep them.
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_OTHER' },
            // Added locally: the extra objects cleanup can be declined.
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL' },
            { pgmid: 'LIMU', object: 'METH', objName: 'ZCL_X                         M' }
        ]);

        expect(SystemConnector.getObjectsLocks).toHaveBeenCalledWith([
            { PGMID: 'R3TR', OBJECT: 'PROG', OBJ_NAME: 'Z_KEPT' },
            { PGMID: 'LIMU', OBJECT: 'METH', OBJ_NAME: 'ZCL_X                         M' }
        ]);
        expect(locks.map(lock => lock.objName)).toEqual(['Z_KEPT', 'ZCL_X                         M']);
    });

    test('nothing the cleanup deletes for sure: no lock lookup', async () => {
        const pkg = installed([{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' }]);

        expect(await getInstalledObjectsLocks(pkg, mappings, [pkg], [
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL' }
        ])).toEqual([]);
        expect(await getInstalledObjectsLocks(pkg, mappings, [pkg], [])).toEqual([]);
        expect(SystemConnector.getObjectsLocks).not.toHaveBeenCalled();
    });
});
