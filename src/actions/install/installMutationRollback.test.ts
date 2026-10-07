jest.mock('../../commons', () => ({
    getPackageNamespace: jest.fn(() => '/TEST/'),
    getPackagesNamespace: jest.fn(() => '/TEST/'),
    getPackageHierarchy: jest.fn(() => ({ devclass: 'ZNEW', sub: [] })),
    getParentFromHierarchy: jest.fn(() => undefined),
    packageDataFromTdevc: jest.fn((_source, overrides) => overrides)
}));

jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getNamespace: jest.fn(),
        addNamespace: jest.fn(),
        getDevclass: jest.fn(),
        getObjectsLocks: jest.fn(),
        getLogonUser: jest.fn(() => 'TESTER'),
        createPackage: jest.fn(),
        tadirInterface: jest.fn(),
        clearPackageSuperpackage: jest.fn(),
        setPackageSuperpackage: jest.fn(),
        deleteTemporaryPackage: jest.fn(),
        getDefaultTransportLayer: jest.fn()
    }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static createToc = jest.fn();
        static upload = jest.fn();
    }
}));

import { Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { getPackageHierarchy, getParentFromHierarchy } from '../../commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { addNamespace } from './addNamespace';
import { generateDevclass } from './generateDevclass';
import { deleteImportedEntries } from './importBatch';
import { cleanupCheckpoint } from './cleanupCheckpoint';
import { installDependencies } from './installDependencies';
import execute from '@simonegaffurini/sammarksworkflow';
import { readFileSync } from 'fs';
import { join } from 'path';

function context() {
    return {
        rawInput: {
            packageData: { name: 'pkg', registry: { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn().mockResolvedValue({ header: Buffer.from('dh'), data: Buffer.from('dd') }) } },
            contextData: { noInquirer: true },
            installData: {
                installDevclass: {
                    keepOriginal: false,
                    skipNamespace: false,
                    transportLayer: 'ZLAYER',
                    replacements: [{ originalDevclass: 'ORIGINAL', installDevclass: 'ZNEW' }]
                }
            }
        },
        runtime: {
            namespace: undefined,
            stopWarningShown: true,
            package: {
                hierarchy: { devclass: 'ORIGINAL', sub: [] },
                data: {
                    manifest: {
                        name: 'pkg', version: '1.0.0',
                        namespace: {
                            replicense: 'license',
                            texts: [{ language: 'E', description: 'Test', owner: 'owner' }]
                        }
                    }
                }
            },
            transports: {
                devc: { binaries: { entries: { tdevc: [{ devclass: 'ORIGINAL' }] } } }
            },
            transportEntries: { tdevct: [] }
        },
        revert: {
            transports: { cust: [] },
            cleanupTransport: undefined,
            cleanupImported: false,
            cleanupSucceeded: false,
            importedEntries: [],
            packageHierarchy: [],
            sapPackages: [],
            namespace: undefined
        }
    } as any;
}

describe('install mutation checkpoints', () => {
    let cleanup: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'success', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        cleanup = {
            entries: [] as any[],
            addObjects: jest.fn(async function (entries: any[]) { this.entries.push(...entries); }),
            removeComments: jest.fn().mockResolvedValue(undefined),
            getE071: jest.fn(async function () { return this.entries; }),
            release: jest.fn().mockResolvedValue(undefined),
            download: jest.fn().mockResolvedValue({ binaries: { header: Buffer.from('h'), data: Buffer.from('d') } }),
            delete: jest.fn().mockResolvedValue(undefined),
            canBeDeleted: jest.fn().mockResolvedValue(true),
            trkorr: 'DEVK9CLEAN'
        };
        jest.spyOn(Transport, 'createToc').mockResolvedValue(cleanup);
        jest.spyOn(Transport, 'upload').mockResolvedValue({ import: jest.fn().mockResolvedValue(0) } as any);
        jest.spyOn(SystemConnector, 'getNamespace').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'getDevclass').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'getObjectsLocks').mockResolvedValue([]);
        jest.spyOn(SystemConnector, 'tadirInterface').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'clearPackageSuperpackage').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'setPackageSuperpackage').mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, 'deleteTemporaryPackage').mockResolvedValue(undefined);
    });

    test('namespace is checkpointed even when its mutating call commits and then throws', async () => {
        const ctx = context();
        jest.spyOn(SystemConnector, 'addNamespace').mockRejectedValue(new Error('response lost'));

        await expect(addNamespace.run(ctx)).rejects.toThrow('response lost');
        expect(ctx.revert.namespace).toBe('/TEST/');

        await deleteImportedEntries(ctx);
        expect(Transport.createToc).toHaveBeenCalledTimes(1);
        expect(cleanup.addObjects).toHaveBeenCalledWith([
            { pgmid: 'R3TR', object: 'NSPC', objName: '/TEST/' }
        ], false);
    });

    test('workbench package is checkpointed before createPackage can throw', async () => {
        const ctx = context();
        jest.spyOn(SystemConnector, 'createPackage').mockRejectedValue(new Error('response lost'));

        await expect(generateDevclass.run(ctx)).rejects.toThrow('response lost');
        expect(ctx.revert.sapPackages).toEqual(['ZNEW']);

        await deleteImportedEntries(ctx);
        expect(cleanup.addObjects).toHaveBeenCalledWith([
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZNEW' }
        ], false);
    });

    test('temporary package uses its dedicated deletion API after createPackage throws', async () => {
        const ctx = context();
        ctx.rawInput.installData.installDevclass.replacements[0].installDevclass = '$TMP';
        jest.spyOn(SystemConnector, 'createPackage').mockRejectedValue(new Error('response lost'));

        await expect(generateDevclass.run(ctx)).rejects.toThrow('response lost');
        await deleteImportedEntries(ctx);

        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenCalledWith('$TMP');
        expect(Transport.createToc).not.toHaveBeenCalled();
    });

    test('namespace and generated packages share exactly one deletion transport', async () => {
        const ctx = context();
        ctx.revert.namespace = '/TEST/';
        ctx.revert.sapPackages = ['ZNEW', 'ZSUB'];

        await deleteImportedEntries(ctx);

        expect(Transport.createToc).toHaveBeenCalledTimes(1);
        expect(ctx.revert.cleanupTransport).toBe(cleanup);
        expect(cleanup.addObjects).toHaveBeenCalledTimes(1);
    });

    test('processed cleanup prevents later reverts from creating another transport', async () => {
        const ctx = context();
        ctx.revert.namespace = '/TEST/';
        ctx.revert.sapPackages = ['ZNEW'];
        ctx.revert.cleanupImported = true;

        await deleteImportedEntries(ctx);
        await deleteImportedEntries(ctx);

        expect(Transport.createToc).not.toHaveBeenCalled();
        expect(cleanup.addObjects).not.toHaveBeenCalled();
    });

    test('cleanup checkpoint cleans imported entries when import step throws before completion is recorded', async () => {
        const ctx = context();
        ctx.revert.importStarted = true;
        ctx.revert.importedEntries = [
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_IMPORTED' }
        ];

        await cleanupCheckpoint.revert(ctx);

        expect(cleanup.addObjects).toHaveBeenCalledWith([
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_IMPORTED' }
        ], false);
        expect(ctx.rawInput.packageData.registry.delete).toHaveBeenCalledTimes(1);
    });

    test('local-registry rollback generates the cleanup deletion transport from the real registry', async () => {
        const ctx = context();
        const realRegistry = {
            getRegistryType: () => RegistryType.PRIVATE,
            delete: jest.fn().mockResolvedValue({ header: Buffer.from('dh'), data: Buffer.from('dd') })
        };
        const fileRegistry = {
            getRegistryType: () => RegistryType.LOCAL,
            getRealRegistry: jest.fn().mockResolvedValue(realRegistry),
            delete: jest.fn().mockRejectedValue(new Error("File system can't generate deletion transports!"))
        };
        ctx.rawInput.packageData.registry = fileRegistry;
        ctx.revert.importStarted = true;
        ctx.revert.importedEntries = [{ pgmid: 'R3TR', object: 'PROG', objName: 'Z_IMPORTED' }];

        await cleanupCheckpoint.revert(ctx);

        expect(fileRegistry.delete).not.toHaveBeenCalled();
        expect(realRegistry.delete).toHaveBeenCalledTimes(1);
        expect(ctx.revert.cleanupSucceeded).toBe(true);
    });

    test('the cleanup checkpoint runs right after the dependency installs', () => {
        const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
        const workflow = /const installWorkflow = \[([\s\S]*?)\];/.exec(source)[1].split(',').map(s => s.trim()).filter(s => s);
        expect(workflow.indexOf('cleanupCheckpoint')).toBe(workflow.indexOf('installDependencies') + 1);
        for (const step of ['addNamespace', 'generateDevclass', 'generateUpdateTransport', 'prepareDevc', 'importBatch']) {
            expect(workflow.indexOf(step)).toBeGreaterThan(workflow.indexOf('cleanupCheckpoint'));
        }
    });

    test.each(['add-namespace', 'generate-devclass'])('a failure in %s cleans up the parent before the dependencies are rolled back', async failingStep => {
        const ctx = context();
        const events: string[] = [];
        ctx.runtime.dependencyRollbacks = [async () => { events.push('dependency-rollback'); }];
        ctx.rawInput.packageData.registry.delete.mockImplementation(async () => {
            events.push('parent-cleanup');
            return { header: Buffer.from('dh'), data: Buffer.from('dd') };
        });
        ctx.revert.packageHierarchy = [{ devclass: 'ZEXISTING', parentcl: 'ZOLD_PARENT' }];
        (SystemConnector.setPackageSuperpackage as jest.Mock).mockImplementation(async () => { events.push('hierarchy-restore'); });
        const dependencies = { name: 'install-dependencies', run: async () => undefined, revert: installDependencies.revert };
        const failing = {
            name: failingStep,
            run: async () => {
                // the step committed its change on SAP, then failed
                if (failingStep === 'add-namespace') {
                    ctx.revert.namespace = '/TEST/';
                } else {
                    ctx.revert.sapPackages.push('ZNEW');
                }
                throw new Error(`${failingStep} failed`);
            }
        };

        await expect(execute('test', [dependencies, cleanupCheckpoint, failing], ctx)).rejects.toThrow(`${failingStep} failed`);

        expect(events).toEqual(['parent-cleanup', 'hierarchy-restore', 'dependency-rollback']);
    });

    test('a failed parent cleanup still rolls back the dependencies', async () => {
        const ctx = context();
        const events: string[] = [];
        ctx.runtime.dependencyRollbacks = [async () => { events.push('dependency-rollback'); }];
        ctx.rawInput.packageData.registry.delete.mockRejectedValue(new Error('cleanup failed'));
        const dependencies = { name: 'install-dependencies', run: async () => undefined, revert: installDependencies.revert };
        const failing = { name: 'generate-devclass', run: async () => { ctx.revert.sapPackages.push('ZNEW'); throw new Error('later'); } };

        await expect(execute('test', [dependencies, cleanupCheckpoint, failing], ctx)).rejects.toThrow('later');

        expect(ctx.revert.cleanupSucceeded).toBe(false);
        expect(events).toEqual(['dependency-rollback']);
    });

    test('snapshots an existing target package before hierarchy edits', async () => {
        const ctx = context();
        const existing = { devclass: 'ZNEW', parentcl: 'ZOLD_PARENT', dlvunit: 'HOME', tpclass: 'A' };
        jest.spyOn(SystemConnector, 'getDevclass').mockResolvedValue(existing as any);

        await generateDevclass.run(ctx);

        expect(ctx.revert.packageHierarchy).toEqual([existing]);
    });

    test('cleanup checkpoint restores existing package hierarchy only after cleanup import succeeds', async () => {
        const ctx = context();
        ctx.revert.sapPackages = ['ZGENERATED'];
        ctx.revert.packageHierarchy = [
            { devclass: 'ZEXISTING', parentcl: 'ZOLD_PARENT' },
            { devclass: 'ZROOT', parentcl: '' }
        ];

        await cleanupCheckpoint.revert(ctx);

        expect(Transport.createToc).toHaveBeenCalledTimes(1);
        expect(ctx.rawInput.packageData.registry.delete).toHaveBeenCalledTimes(1);
        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZEXISTING', 'ZOLD_PARENT');
        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZROOT');
        expect(ctx.rawInput.packageData.registry.delete.mock.invocationCallOrder[0])
            .toBeLessThan((SystemConnector.setPackageSuperpackage as jest.Mock).mock.invocationCallOrder[0]);
    });

    test('hierarchy restoration is best-effort across all existing packages', async () => {
        const ctx = context();
        ctx.revert.cleanupImported = true;
        ctx.revert.cleanupSucceeded = true;
        ctx.revert.packageHierarchy = [
            { devclass: 'ZCHILD', parentcl: 'ZPARENT' },
            { devclass: 'ZROOT', parentcl: '' }
        ];
        jest.spyOn(SystemConnector, 'setPackageSuperpackage').mockRejectedValue(new Error('restore failed'));

        await expect(cleanupCheckpoint.revert(ctx)).rejects.toThrow('restore failed');

        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZROOT');
    });

    test.each(['clear', 'set'])('%s hierarchy failure restores every original package relationship', async point => {
        const ctx = context();
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ORIGINAL_ROOT', installDevclass: 'ZROOT' },
            { originalDevclass: 'ORIGINAL_CHILD', installDevclass: 'ZCHILD' }
        ];
        ctx.runtime.package.hierarchy = {
            devclass: 'ORIGINAL_ROOT',
            sub: [{ devclass: 'ORIGINAL_CHILD', sub: [] }]
        };
        ctx.runtime.transports.devc.binaries.entries.tdevc = [
            { devclass: 'ORIGINAL_ROOT' },
            { devclass: 'ORIGINAL_CHILD' }
        ];
        (getPackageHierarchy as jest.Mock).mockReturnValue({
            devclass: 'ZROOT', sub: [{ devclass: 'ZCHILD', sub: [] }]
        });
        (getParentFromHierarchy as jest.Mock).mockImplementation((_hierarchy, devclass) =>
            devclass === 'ORIGINAL_CHILD' ? 'ORIGINAL_ROOT' : undefined
        );
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass =>
            devclass === 'ZROOT'
                ? { devclass: 'ZROOT', parentcl: '', dlvunit: 'HOME', tpclass: 'A' }
                : { devclass: 'ZCHILD', parentcl: 'ZOLD_PARENT', dlvunit: 'HOME', tpclass: 'A' }
        );
        if (point === 'clear') {
            (SystemConnector.clearPackageSuperpackage as jest.Mock)
                .mockRejectedValueOnce(new Error('clear failed'))
                .mockResolvedValue(undefined);
        } else {
            (SystemConnector.setPackageSuperpackage as jest.Mock)
                .mockRejectedValueOnce(new Error('set failed'))
                .mockResolvedValue(undefined);
        }

        await expect(generateDevclass.run(ctx)).rejects.toThrow(`${point} failed`);
        await cleanupCheckpoint.revert(ctx);

        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZCHILD', 'ZOLD_PARENT');
        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZROOT');
    });

    describe('transport layer', () => {
        test('default layer is resolved only when transportable packages are created', async () => {
            const ctx = context();
            delete ctx.rawInput.installData.installDevclass.transportLayer;
            (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue('ZDEF');
            (SystemConnector.createPackage as jest.Mock).mockResolvedValue(undefined);

            await generateDevclass.run(ctx);

            expect(SystemConnector.getDefaultTransportLayer).toHaveBeenCalledTimes(1);
            expect(SystemConnector.createPackage).toHaveBeenCalledWith(expect.objectContaining({ devclass: 'ZNEW', pdevclass: 'ZDEF' }));
        });

        test('explicit layer is used without a default lookup', async () => {
            const ctx = context();
            (SystemConnector.createPackage as jest.Mock).mockResolvedValue(undefined);

            await generateDevclass.run(ctx);

            expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
            expect(SystemConnector.createPackage).toHaveBeenCalledWith(expect.objectContaining({ pdevclass: 'ZLAYER' }));
        });

        test('existing packages need no transport layer', async () => {
            const ctx = context();
            delete ctx.rawInput.installData.installDevclass.transportLayer;
            (SystemConnector.getDevclass as jest.Mock).mockResolvedValue({ devclass: 'ZNEW', parentcl: '', dlvunit: 'HOME', tpclass: 'A' });

            await generateDevclass.run(ctx);

            expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
            expect(SystemConnector.createPackage).not.toHaveBeenCalled();
        });

        test('local packages are created without a transport layer', async () => {
            const ctx = context();
            delete ctx.rawInput.installData.installDevclass.transportLayer;
            ctx.runtime.namespace = '$';
            ctx.rawInput.installData.installDevclass.replacements[0].installDevclass = '$NEW';
            (SystemConnector.createPackage as jest.Mock).mockResolvedValue(undefined);

            await generateDevclass.run(ctx);

            expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
            expect(SystemConnector.createPackage).toHaveBeenCalledWith(expect.objectContaining({ devclass: '$NEW', dlvunit: 'LOCAL', pdevclass: '' }));
        });

        test.each([
            ['lookup fails', () => (SystemConnector.getDefaultTransportLayer as jest.Mock).mockRejectedValue(new Error('rfc down')), "Couldn't determine system's default transport layer."],
            ['no default exists', () => (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue(''), 'System has no default transport layer, specify one.']
        ])('aborts before creating any package when the %s', async (_point, inject, message) => {
            const ctx = context();
            delete ctx.rawInput.installData.installDevclass.transportLayer;
            inject();

            await expect(generateDevclass.run(ctx)).rejects.toThrow(message);
            expect(SystemConnector.createPackage).not.toHaveBeenCalled();
            expect(ctx.revert.sapPackages).toEqual([]);

            await deleteImportedEntries(ctx);
            expect(Transport.createToc).not.toHaveBeenCalled();
        });
    });
});
