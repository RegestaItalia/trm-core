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
        readTable: jest.fn(async () => [{ role: 'C' }]),
        addNamespace: jest.fn(),
        getDest: jest.fn(() => 'TST'),
        deleteTmsTransport: jest.fn()
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
        static customizingKeys: Record<string, { table: string, tabkey?: string }[]> = {};
        getCustomizingKeys = jest.fn(async () => MockTransport.customizingKeys[this.trkorr] || [{ table: 'ZCUST_TABLE', tabkey: '100K1' }]);
        canBeDeleted = jest.fn(async () => false);
        delete = jest.fn().mockResolvedValue(undefined);
        addObjects = jest.fn().mockResolvedValue(undefined);
        release = jest.fn().mockResolvedValue(undefined);
        download = jest.fn(async () => ({ binaries: { header: Buffer.from(this.trkorr), data: Buffer.from('d') } }));
        removeComments = jest.fn().mockResolvedValue(undefined);
        addComment = jest.fn().mockResolvedValue(undefined);
        import = jest.fn().mockResolvedValue(0);
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

function runContext(previous: any[], devclass = 'Z_ROOT') {
    const backup = new Transport('DEVK9BKP') as any;
    const dummy = new Transport('DEVK9DELE') as any;
    (Transport.createToc as jest.Mock).mockReset();
    (Transport.createToc as jest.Mock).mockResolvedValueOnce(backup).mockResolvedValueOnce(dummy);
    const acquire = jest.fn().mockResolvedValue(undefined);
    const registry = {
        getRegistryType: () => RegistryType.PRIVATE,
        delete: jest.fn(async () => ({ empty: false, binaries: { header: Buffer.from('dh'), data: Buffer.from('dd') } }))
    };
    const ctx = {
        lockScope: { acquire },
        rawInput: {
            packageData: { name: 'pkg', registry },
            contextData: { noInquirer: true },
            uninstallData: { checks: {} }
        },
        runtime: {
            stopWarningShown: true,
            update: {
                manifest: { get: () => ({ name: 'pkg', version: '1.0.0' }) },
                getTransport: () => ({ getE071: async () => previous, getE071K: async () => [] }),
                getDevclass: () => devclass
            },
            previousInstallPackages: [{ originalDevclass: 'Z_ORIG', installDevclass: devclass }],
            previousInstallTransports: []
        },
        revert: { sapPackages: [] },
        output: { manifest: { name: 'pkg' } }
    } as any;
    return { ctx, backup, dummy, acquire, registry };
}

describe('generateDeletionTransport', () => {
    let imported: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        (Transport as any).instances.length = 0;
        (Transport as any).existing.clear();
        for (const method of ['loading', 'success', 'warning', 'error', 'log', 'info'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects.map((o: any) => ({ ...o, devclass: 'Z_ROOT' })));
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue(undefined);
        imported = new Transport('DEVK9DELE');
        (Transport.upload as jest.Mock).mockResolvedValue(imported);
    });

    test('backs up the installation, deletes it through the registry and imports the deletion', async () => {
        const { ctx, backup, registry } = runContext([
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_TABLE' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }
        ]);

        await generateDeletionTransport.run(ctx);

        expect(Transport.createToc).toHaveBeenNthCalledWith(1, { text: '@X1@TRM (BKP) pkg 1.0.0', target: 'TST' });
        expect(Transport.createToc).toHaveBeenNthCalledWith(2, { text: '@X1@TRM (DELE) pkg 1.0.0', target: 'TST' });
        const backedUp = backup.addObjects.mock.calls[0][0].map((o: any) => `${o.object} ${o.objName}`);
        expect(backedUp.sort()).toEqual(['CLAS Z_CLASS', 'DEVC Z_ROOT', 'TABL Z_TABLE']);
        // nothing is subtracted: there is no incoming release
        expect(registry.delete).toHaveBeenCalledWith(expect.anything(), { target: 'DEVK9DELE' });
        expect(imported.import).toHaveBeenCalledWith(true);
        expect(imported.import).toHaveBeenCalledWith(false);
        expect(ctx.output.transport).toBe(imported);
        expect(ctx.output.deletions).toEqual([imported]);
        expect(ctx.revert.backup.tadir.binaries.trkorr).toBe('DEVK9BKP');
    });

    test('the deletions of the nested uninstalls are carried with its own', async () => {
        const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        const nested = new Transport('DEVK9NESTED');
        ctx.runtime.nestedDeletions = [nested];

        await generateDeletionTransport.run(ctx);

        expect(ctx.output.deletions).toEqual([nested, imported]);
    });

    test('an unauthorized deletion aborts the uninstall before anything is deleted', async () => {
        const { ctx, registry } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        const error = new RegistryDeletionTransportUnauthorizedError('endpoint', new Error('401'));
        registry.delete.mockRejectedValue(error);

        await expect(generateDeletionTransport.run(ctx)).rejects.toBe(error);

        expect(Transport.upload).not.toHaveBeenCalled();
        expect(ctx.revert.deleImportStarted).toBeFalsy();
    });

    test('an import ending with return code 8 fails, and the rollback restores the backup and dequeues the deletion', async () => {
        const { ctx, dummy } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        imported.import.mockImplementation(async (test: boolean) => test ? 0 : 8);

        await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('Import of deletion transport: transport DEVK9DELE ended with return code 8');
        expect(ctx.revert.deleImportStarted).toBe(true);

        const restored = { import: jest.fn().mockResolvedValue(0) };
        (Transport.upload as jest.Mock).mockResolvedValue(restored);
        await generateDeletionTransport.revert(ctx);

        expect(Transport.upload).toHaveBeenCalledWith('DEVK9BKP', expect.anything());
        expect(restored.import).toHaveBeenCalledWith(false);
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith(dummy.trkorr, 'TST');
        expect(SystemConnector.deleteTmsTransport).not.toHaveBeenCalledWith('DEVK9BKP', expect.anything());
    });

    test('a failure before the import restores nothing and keeps the backup', async () => {
        const { ctx, registry, backup } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        registry.delete.mockRejectedValue(new Error('registry down'));

        await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('registry down');
        await generateDeletionTransport.revert(ctx);

        expect(Transport.upload).not.toHaveBeenCalled();
        expect(backup.delete).not.toHaveBeenCalled();
        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('DEVK9DELE', 'TST');
    });

    test('lock conflicts abort before anything is changed', async () => {
        const { ctx } = runContext([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS' }]);
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_CLASS', trkorr: 'DEVK9OTHER' }]);

        await expect(generateDeletionTransport.run(ctx)).rejects.toThrow('Uninstall aborted');
        expect(Transport.createToc).not.toHaveBeenCalled();
    });

    test('nothing to delete only warns', async () => {
        const { ctx } = runContext([]);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);

        await generateDeletionTransport.run(ctx);

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Nothing to delete for package pkg'), { important: true });
        expect(ctx.output.transport).toBeUndefined();
        expect(ctx.output.deletions).toEqual([]);
    });

    test('customizing of the recorded transports is backed up and deleted by key', async () => {
        const { ctx, registry } = runContext([]);
        const custBackup = new Transport('DEVK9BKPC') as any;
        const custDummy = new Transport('DEVK9DELEC') as any;
        (Transport.createToc as jest.Mock).mockReset();
        (Transport.createToc as jest.Mock).mockResolvedValueOnce(custBackup).mockResolvedValueOnce(custDummy);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);
        ctx.runtime.previousInstallTransports = [{ trkorr: 'DEVK9CUST', trmType: 'CUST' }];
        (Transport as any).existing.add('DEVK9CUST');
        (Transport.upload as jest.Mock).mockResolvedValue(new Transport('DEVK9DELEC'));

        await generateDeletionTransport.run(ctx);

        expect(Transport.createToc).toHaveBeenNthCalledWith(1, { text: '@X1@TRM (BKP) pkg 1.0.0', target: 'TST' });
        expect(custBackup.addObjectsFromTransport).toHaveBeenCalledWith('DEVK9CUST');
        expect(Transport.createToc).toHaveBeenNthCalledWith(2, { text: '@X1@TRM (DELE) pkg 1.0.0', target: 'TST' });
        expect(registry.delete).toHaveBeenCalledWith(expect.anything(), { target: 'DEVK9DELEC' });
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
    const nested = { packageName: 'nested', getDevclass: () => 'Z_NESTED' } as any;

    beforeEach(() => {
        jest.clearAllMocks();
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getObjectsLocks as jest.Mock).mockImplementation(async objects => objects.map((o: any) => ({
            pgmid: o.PGMID, object: o.OBJECT, objName: o.OBJ_NAME, trkorr: 'DEVK9EDIT'
        })));
        // Objects without a SAP package here don't exist on the system.
        const devclasses: Record<string, string> = {
            Z_KEPT: 'Z_ROOT', Z_MOVED: 'Z_CUSTOM', Z_OTHER: 'Z_NESTED', Z_ROOT: 'Z_ROOT', Z_NESTED: 'Z_NESTED'
        };
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects
            .filter((o: any) => devclasses[o.objName])
            .map((o: any) => ({ ...o, devclass: devclasses[o.objName] })));
    });

    test('checks every installed object the cleanup deletes for sure, dirty or not', async () => {
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([{ devclass: 'Z_NESTED', parentcl: 'Z_ROOT' }]);
        const pkg = installed([
            { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT' },
            // Moved outside the installation, or into another TRM package: the cleanup may keep them.
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_OTHER' },
            // Not on the system: nothing to delete.
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_GONE' },
            { pgmid: 'LIMU', object: 'METH', objName: 'ZCL_X                         M' }
        ]);

        const locks = await getInstalledObjectsLocks(pkg, mappings, [pkg, nested]);

        // A TRM package installed underneath keeps the SAP packages.
        expect(SystemConnector.getDevclassObjects).not.toHaveBeenCalled();
        expect(SystemConnector.getObjectsLocks).toHaveBeenCalledWith([
            { PGMID: 'R3TR', OBJECT: 'PROG', OBJ_NAME: 'Z_KEPT' },
            { PGMID: 'LIMU', OBJECT: 'METH', OBJ_NAME: 'ZCL_X                         M' }
        ]);
        expect(locks.map(lock => lock.objName)).toEqual(['Z_KEPT', 'ZCL_X                         M']);
    });

    test('SAP packages without local additions are deleted for sure', async () => {
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([
            { pgmid: 'R3TR', object: 'DEVC', objName: 'Z_ROOT', devclass: 'Z_ROOT' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT', devclass: 'Z_ROOT' }
        ]);
        const pkg = installed([{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT' }]);

        await getInstalledObjectsLocks(pkg, mappings, [pkg]);

        expect(SystemConnector.getObjectsLocks).toHaveBeenCalledWith([
            { PGMID: 'R3TR', OBJECT: 'PROG', OBJ_NAME: 'Z_KEPT' },
            { PGMID: 'R3TR', OBJECT: 'DEVC', OBJ_NAME: 'Z_ROOT' }
        ]);
    });

    test('locally added objects or packages may keep the SAP packages', async () => {
        const pkg = installed([{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT' }]);
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_KEPT', devclass: 'Z_ROOT' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL', devclass: 'Z_ROOT' }
        ]);

        await getInstalledObjectsLocks(pkg, mappings, [pkg]);

        expect(SystemConnector.getObjectsLocks).toHaveBeenLastCalledWith([{ PGMID: 'R3TR', OBJECT: 'PROG', OBJ_NAME: 'Z_KEPT' }]);

        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([{ devclass: 'Z_NESTED', parentcl: 'Z_ROOT' }]);

        await getInstalledObjectsLocks(pkg, mappings, [pkg]);

        expect(SystemConnector.getObjectsLocks).toHaveBeenLastCalledWith([{ PGMID: 'R3TR', OBJECT: 'PROG', OBJ_NAME: 'Z_KEPT' }]);
    });

    test('nothing the cleanup deletes for sure: no lock lookup', async () => {
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([{ devclass: 'Z_NESTED', parentcl: 'Z_ROOT' }]);
        const pkg = installed([
            { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_MOVED' }
        ]);

        expect(await getInstalledObjectsLocks(pkg, mappings, [pkg])).toEqual([]);
        expect(SystemConnector.getObjectsLocks).not.toHaveBeenCalled();
    });
});
