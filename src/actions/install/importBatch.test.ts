jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(),
        isStateless: jest.fn(),
        closeConnection: jest.fn(),
        connect: jest.fn(),
        setPackageTransportLayer: jest.fn(),
        setPackageSuperpackage: jest.fn(),
        clearPackageSuperpackage: jest.fn(),
        tadirInterface: jest.fn(),
        deleteTemporaryPackage: jest.fn(),
        getDevclass: jest.fn().mockResolvedValue(undefined),
        getDefaultTransportLayer: jest.fn(),
        getSupportedBulk: jest.fn().mockReturnValue({}),
        getExistingObjects: jest.fn().mockResolvedValue([]),
        getNamespace: jest.fn().mockResolvedValue(undefined),
        createPackage: jest.fn(),
        getLogonUser: jest.fn(() => 'TESTER')
    }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static createToc = jest.fn();
        static importMultiple = jest.fn();
        static upload = jest.fn();
    }
}));

jest.mock('../../registry', () => {
    class RegistryDeletionTransportUnavailableError extends Error { }
    return {
        ...jest.requireActual('../../registry/RegistryType'),
        RegistryDeletionTransportUnavailableError,
        RegistryDeletionTransportUnauthorizedError: class RegistryDeletionTransportUnauthorizedError extends RegistryDeletionTransportUnavailableError {
            constructor(public registryEndpoint: string, public originalError: unknown) {
                super(`Deletion denied by ${registryEndpoint}`);
            }
        }
    };
});

import execute from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { RegistryDeletionTransportUnauthorizedError, RegistryType } from '../../registry';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { deleteImportedEntries, importBatch } from './importBatch';
import { cleanupCheckpoint } from './cleanupCheckpoint';

type RegistryOutcome = 'allowed' | 'denied';

// Entries here mirror what SystemConnector.readTable('E071', ...) would return from
// a real transport - but production code must NOT source these from a live RFC read
// (see importedTransports in importBatch.ts): transports built by TRM inject a
// downloaded payload directly into cofiles/data, bypassing the normal object-list
// recording APIs, so SAP's own E071 table is never a reliable source for "what does
// this transport actually contain". These entries instead live on
// context.runtime.transports.*.binaries.entries.e071, already parsed client-side from
// the registry payload during check-transports - which is what these mock contexts
// populate below, one slot (tadir/devc/lang/cust) each.
const importedEntries = [
    { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' },
    { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_TWO' },
    { pgmid: 'R3TR', object: 'TABL', objName: 'Z_THREE' },
    { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' }
];

function makeImportedTransport(index: number): Transport {
    return {
        trkorr: `DEVK90000${index}`,
        getE070: jest.fn().mockResolvedValue({ trkorr: `DEVK90000${index}` })
    } as unknown as Transport;
}

function makeContext(registryDelete: jest.Mock) {
    const transports = [0, 1, 2, 3].map(makeImportedTransport);
    return {
        rawInput: {
            packageData: {
                name: 'test-package',
                registry: { getRegistryType: () => RegistryType.PRIVATE, delete: registryDelete }
            },
            installData: {
                installDevclass: {
                    keepOriginal: true,
                    transportLayer: 'ZLAYER',
                    replacements: []
                }
            }
        },
        runtime: {
            package: {
                data: { manifest: { name: 'test-package', version: '1.0.0' } },
                hierarchy: { devclass: 'ZROOT', sub: [] }
            },
            update: undefined,
            rootDevclassBeforeImport: { devclass: 'ZROOT', parentcl: 'ZPARENT' },
            transports: {
                tadir: {
                    instance: transports[0],
                    binaries: { entries: {
                        tadir: [
                            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE', devclass: 'ZROOT', srcsystem: 'OLD' },
                            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_TWO', devclass: 'ZROOT', srcsystem: 'OLD' }
                        ],
                        e071: [importedEntries[0]]
                    } }
                },
                devc: {
                    instance: transports[1],
                    binaries: { entries: {
                        tdevc: [
                            { devclass: 'ZROOT' },
                            { devclass: 'ZSUB' }
                        ],
                        tadir: [
                            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT', devclass: 'ZROOT', srcsystem: 'OLD' },
                            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZSUB', devclass: 'ZROOT', srcsystem: 'OLD' }
                        ],
                        e071: [importedEntries[1]]
                    } }
                },
                lang: { instance: transports[2], binaries: { entries: { e071: [importedEntries[2]] } } },
                cust: [{ instance: transports[3], binaries: { entries: { e071: [importedEntries[3]] } } }]
            }
        },
        revert: {
            transports: { cust: [] },
            cleanupTransport: undefined,
            cleanupImported: false,
            cleanupSucceeded: false,
            importStarted: false,
            importedEntries: [],
            sapPackages: ['ZGENERATED', '$TMP'],
            namespace: '/TEST/'
        }
    } as any;
}

describe('importBatch rollback checkpoint', () => {
    const events: string[] = [];
    let failurePoint: string | undefined;
    let cleanupTransport: any;
    let registryDelete: jest.Mock;

    const fail = async (point: string): Promise<void> => {
        events.push(point);
        if (failurePoint === point) {
            throw new Error(`failure at ${point}`);
        }
    };

    beforeEach(() => {
        events.length = 0;
        failurePoint = undefined;
        jest.restoreAllMocks();
        jest.clearAllMocks();

        for (const method of ['loading', 'log', 'success', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }

        cleanupTransport = {
            trkorr: 'DEVK9CLEAN',
            entries: [] as any[],
            addObjects: jest.fn(async function (entries: any[]) {
                await fail('cleanup.addObjects');
                this.entries.push(...entries);
            }),
            addObjectsFromTransport: jest.fn(async (trkorr: string) => fail(`cleanup.addObjectsFromTransport.${trkorr}`)),
            removeComments: jest.fn(async () => fail('cleanup.removeComments')),
            getE071: jest.fn(async function () {
                await fail('cleanup.getE071');
                return this.entries;
            }),
            release: jest.fn(async () => fail('cleanup.release')),
            download: jest.fn(async () => {
                await fail('cleanup.download');
                return { binaries: { header: Buffer.from('h'), data: Buffer.from('d') } };
            }),
            delete: jest.fn(async () => fail('cleanup.delete')),
            canBeDeleted: jest.fn(async () => {
                await fail('cleanup.canBeDeleted');
                return true;
            })
        };

        registryDelete = jest.fn(async () => {
            await fail('registry.delete');
            return { header: Buffer.from('dh'), data: Buffer.from('dd') };
        });

        jest.spyOn(Transport, 'createToc').mockImplementation(async () => {
            await fail('cleanup.createToc');
            return cleanupTransport;
        });
        jest.spyOn(Transport, 'importMultiple').mockImplementation(async () => {
            await fail('importMultiple');
            return [];
        });
        jest.spyOn(Transport, 'upload').mockImplementation(async () => {
            await fail('cleanup.upload');
            return {
                trkorr: 'DEVK9CLEAN',
                import: async (test: boolean) => fail(test ? 'cleanup.import.test' : 'cleanup.import.live')
            } as unknown as Transport;
        });

        jest.spyOn(SystemConnector, 'getDest').mockReturnValue('TST');
        (SystemConnector.getSupportedBulk as jest.Mock).mockReturnValue({});
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);
        jest.spyOn(SystemConnector, 'isStateless').mockReturnValue(false);
        jest.spyOn(SystemConnector, 'closeConnection').mockImplementation(() => fail('closeConnection'));
        jest.spyOn(SystemConnector, 'connect').mockImplementation(() => fail('connect'));

        let layerCall = 0;
        jest.spyOn(SystemConnector, 'setPackageTransportLayer').mockImplementation(async () => {
            layerCall++;
            await fail(`setPackageTransportLayer.${layerCall}`);
        });
        jest.spyOn(SystemConnector, 'setPackageSuperpackage').mockImplementation(() => fail('setPackageSuperpackage'));
        jest.spyOn(SystemConnector, 'clearPackageSuperpackage').mockImplementation(() => fail('clearPackageSuperpackage'));
        jest.spyOn(SystemConnector, 'deleteTemporaryPackage').mockImplementation(() => fail('deleteTemporaryPackage'));

        let tadirCall = 0;
        jest.spyOn(SystemConnector, 'tadirInterface').mockImplementation(async () => {
            tadirCall++;
            await fail(`tadirInterface.${tadirCall}`);
        });
    });

    async function runFailure(point: string, outcome: RegistryOutcome, failAfterStep = false): Promise<any> {
        failurePoint = point;
        if (outcome === 'denied') {
            registryDelete.mockImplementation(async () => {
                events.push('registry.delete');
                throw new RegistryDeletionTransportUnauthorizedError('registry', new Error('denied'));
            });
        } else if (point === 'cleanup.canBeDeleted') {
            registryDelete.mockImplementation(async () => {
                events.push('registry.delete');
                throw new Error('registry conversion failed');
            });
        }
        const context = makeContext(registryDelete);
        const restore = {
            name: 'prepared-transport',
            run: async () => undefined,
            revert: async () => {
                if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                    events.push('restore-old-payload');
                }
            }
        };
        const laterFailure = {
            name: 'later-failure',
            run: async () => { throw new Error('failure after importBatch'); }
        };

        await expect(execute('test', failAfterStep ? [restore, importBatch, laterFailure] : [restore, importBatch], context))
            .rejects.toThrow();
        return context;
    }

    const runAwaitFailures = [
        'importMultiple',
        'closeConnection',
        'connect',
        'setPackageTransportLayer.1',
        'setPackageTransportLayer.2',
        'setPackageSuperpackage',
        'tadirInterface.1',
        'tadirInterface.2',
        'tadirInterface.3',
        'tadirInterface.4'
    ];

    describe.each(['allowed', 'denied'] as RegistryOutcome[])('when registry deletion is %s', outcome => {
        test.each(runAwaitFailures)('failure at %s cleans before restoring old payload', async point => {
            const context = await runFailure(point, outcome);

            expect(Transport.createToc).toHaveBeenCalledTimes(1);
            expect(cleanupTransport.addObjects).toHaveBeenCalledTimes(1);
            expect(registryDelete).toHaveBeenCalledTimes(1);
            expect(context.revert.cleanupImported).toBe(true);
            if (outcome === 'allowed') {
                expect(events).toContain('cleanup.import.live');
                expect(context.revert.cleanupSucceeded).toBe(true);
                expect(events).toContain('restore-old-payload');
                expect(events.indexOf('cleanup.import.live')).toBeLessThan(events.indexOf('restore-old-payload'));
            } else {
                expect(context.revert.cleanupSucceeded).toBe(false);
                expect(events).not.toContain('cleanup.import.test');
                expect(events).not.toContain('cleanup.import.live');
                expect(events).not.toContain('restore-old-payload');
            }
        });

        test('a failure after the completed step uses the same checkpoint before restore', async () => {
            const context = await runFailure('unused', outcome, true);

            expect(Transport.createToc).toHaveBeenCalledTimes(1);
            expect(cleanupTransport.addObjects).toHaveBeenCalledTimes(1);
            expect(registryDelete).toHaveBeenCalledTimes(1);
            expect(context.revert.cleanupImported).toBe(true);
            if (outcome === 'allowed') {
                expect(events.indexOf('registry.delete')).toBeLessThan(events.indexOf('restore-old-payload'));
            } else {
                expect(events).not.toContain('restore-old-payload');
            }
        });
    });

    test('the shared checkpoint contains each imported entry once plus generated objects', async () => {
        await runFailure('connect', 'allowed');

        const entries = cleanupTransport.addObjects.mock.calls[0][0];
        expect(entries).toEqual(expect.arrayContaining([
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'Z_TWO' },
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_THREE' },
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZGENERATED' },
            { pgmid: 'R3TR', object: 'NSPC', objName: '/TEST/' }
        ]));
        expect(entries).toHaveLength(5);
    });

    test('a failure after import keeps tables retained by the upgrade out of the cleanup', async () => {
        const context = makeContext(registryDelete);
        context.revert.retainedTables = { trkorr: 'DEVK9BKP', entries: undefined, binaries: {} };
        context.revert.retainedTableObjects = [{ pgmid: 'R3TR', object: 'TABL', objName: 'z_three' }];
        failurePoint = 'connect';
        const restore = { name: 'restore', run: async () => undefined, revert: async () => undefined };

        await expect(execute('test', [restore, importBatch], context)).rejects.toThrow('failure at connect');

        const entries = cleanupTransport.addObjects.mock.calls[0][0];
        expect(entries).not.toContainEqual({ pgmid: 'R3TR', object: 'TABL', objName: 'Z_THREE' });
        expect(entries).toContainEqual({ pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' });
        expect(context.revert.cleanupSucceeded).toBe(true);
    });

    test('retained tables without a backup are still cleaned up', async () => {
        const context = makeContext(registryDelete);
        context.revert.retainedTableObjects = [{ pgmid: 'R3TR', object: 'TABL', objName: 'Z_THREE' }];
        failurePoint = 'connect';
        const restore = { name: 'restore', run: async () => undefined, revert: async () => undefined };

        await expect(execute('test', [restore, importBatch], context)).rejects.toThrow('failure at connect');

        expect(cleanupTransport.addObjects.mock.calls[0][0]).toContainEqual({ pgmid: 'R3TR', object: 'TABL', objName: 'Z_THREE' });
    });

    test('imported customizing is copied into the cleanup transport instead of added without its keys', async () => {
        const context = makeContext(registryDelete);
        context.runtime.transports.cust[0].binaries.entries.e071 = [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZCUST_TABLE' }];
        failurePoint = 'connect';
        const restore = { name: 'restore', run: async () => undefined, revert: async () => undefined };

        await expect(execute('test', [restore, importBatch], context)).rejects.toThrow();

        expect(cleanupTransport.addObjects.mock.calls[0][0]).not.toContainEqual({ pgmid: 'R3TR', object: 'TABU', objName: 'ZCUST_TABLE' });
        expect(cleanupTransport.addObjectsFromTransport).toHaveBeenCalledWith('DEVK900003');
        expect(events.indexOf('cleanup.addObjectsFromTransport.DEVK900003')).toBeLessThan(events.indexOf('registry.delete'));
        expect(context.revert.cleanupSucceeded).toBe(true);
    });

    test('customizing transport not imported on the system is skipped', async () => {
        const context = makeContext(registryDelete);
        (context.runtime.transports.cust[0].instance.getE070 as jest.Mock).mockResolvedValue(undefined);
        failurePoint = 'importMultiple';
        const restore = { name: 'restore', run: async () => undefined, revert: async () => undefined };

        await expect(execute('test', [restore, importBatch], context)).rejects.toThrow('failure at importMultiple');

        expect(cleanupTransport.addObjectsFromTransport).not.toHaveBeenCalled();
        expect(context.revert.cleanupSucceeded).toBe(true);
    });

    test('a failed customizing copy still releases the cleanup and temporary packages but blocks old payload restore', async () => {
        const context = await runFailure('cleanup.addObjectsFromTransport.DEVK900003', 'allowed', true);

        expect(cleanupTransport.addObjects).toHaveBeenCalledTimes(1);
        expect(registryDelete).toHaveBeenCalledTimes(1);
        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenCalledWith('$TMP');
        expect(context.revert.cleanupImported).toBe(true);
        expect(context.revert.cleanupSucceeded).toBe(false);
        expect(events).not.toContain('restore-old-payload');
    });

    test('excludes a transport slot from import and from the revert checkpoint when it was never actually uploaded', async () => {
        // Regression test: mirrors "Skipping import DEVC transport" - when the install
        // devclass is generated directly (generateDevclass.ts) instead of importing the
        // package's own DEVC transport, that slot's `instance` is never set. Its registry
        // payload can still describe a devclass (e.g. the package's original ZEXPERIMENTAL)
        // that was never created on the target system at all. If that payload leaked into
        // the revert checkpoint, the deletion transport would reference a non-existent
        // package and SAP would reject the whole cleanup ("Package ... does not exist"),
        // aborting revert entirely and leaving everything that WAS created behind.
        const context = makeContext(registryDelete);
        const devcInstance = context.runtime.transports.devc.instance;
        context.runtime.transports.devc.instance = undefined;
        failurePoint = 'connect';
        const restore = { name: 'restore', run: async () => undefined, revert: async () => undefined };

        await expect(execute('test', [restore, importBatch], context)).rejects.toThrow();

        const importedTransportsArg = (Transport.importMultiple as jest.Mock).mock.calls[0][0];
        expect(importedTransportsArg).not.toContain(devcInstance);

        const entries = cleanupTransport.addObjects.mock.calls[0][0];
        expect(entries).not.toContainEqual({ pgmid: 'R3TR', object: 'CLAS', objName: 'Z_TWO' });
        expect(entries).toEqual(expect.arrayContaining([
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' },
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_THREE' },
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZGENERATED' },
            { pgmid: 'R3TR', object: 'NSPC', objName: '/TEST/' }
        ]));
        expect(entries).toHaveLength(4);
    });

    test('a single object SAP refuses to add does not block cleanup of everything else', async () => {
        // Regression test: SAP's ADD_OBJS_TR can reject the WHOLE batch call when even
        // one object's bookkept current package doesn't exist on the target (e.g. a
        // namespace-rejected object left referencing a devclass that was only ever a
        // transient placeholder - see importedTransports). The batch call must fall back
        // to adding objects one at a time so the generated devclass (and any other
        // addable object) still gets cleaned up, instead of one poisoned entry blocking
        // everything.
        const context = makeContext(registryDelete);
        context.revert.sapPackages = ['/ATRM/EXP'];
        context.revert.namespace = undefined;
        context.revert.importedEntries = [
            { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_EXPERIMENTAL1' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_EXPERIMENTAL2' }
        ];
        cleanupTransport.addObjects = jest.fn(async function (entries: any[]) {
            if (entries.some(entry => entry.object === 'CLAS')) {
                throw new Error('Package ZEXPERIMENTAL does not exist');
            }
            this.entries.push(...entries);
        });

        // The function still surfaces a failure overall (not everything could be
        // cleaned up), but that must not come at the cost of losing partial cleanup.
        await expect(deleteImportedEntries(context)).rejects.toThrow('Package ZEXPERIMENTAL does not exist');

        // First attempt is the batch call (all 3 entries); it fails because of the
        // CLAS entries, so it must retry one at a time.
        expect(cleanupTransport.addObjects).toHaveBeenNthCalledWith(1, expect.arrayContaining([
            { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_EXPERIMENTAL1' },
            { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_EXPERIMENTAL2' },
            { pgmid: 'R3TR', object: 'DEVC', objName: '/ATRM/EXP' }
        ]), false);
        expect(cleanupTransport.addObjects).toHaveBeenCalledWith([{ pgmid: 'R3TR', object: 'DEVC', objName: '/ATRM/EXP' }], false);
        // The generated devclass got cleaned up despite the two CLAS failures.
        expect(cleanupTransport.entries).toContainEqual({ pgmid: 'R3TR', object: 'DEVC', objName: '/ATRM/EXP' });
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('ZCL_EXPERIMENTAL1'));
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('ZCL_EXPERIMENTAL2'));
        // Not everything could be cleaned up: this must still be reported as a
        // failure, so a later revert step doesn't restore old data on top of objects
        // that remain in the system.
        expect(context.revert.cleanupSucceeded).toBe(false);
    });

    test('imported objects still in a package that does not exist are staged, then deleted with the staging package', async () => {
        // A renamed install imports into the original package names: a failure before the import is finalized
        // leaves the objects assigned to a package that was never created.
        const context = makeContext(registryDelete);
        context.revert.sapPackages = [];
        context.revert.namespace = undefined;
        context.revert.importedEntries = [{ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG' }];
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValueOnce([{ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG', devclass: '/NS/ORIGINAL' }]);
        cleanupTransport.addObjects = jest.fn(async function (entries: any[]) { this.entries.push(...entries); });

        await deleteImportedEntries(context);

        const staging = context.revert.stagingPackages[0];
        expect(staging).toMatch(/^ZTRM_DELE_/);
        expect(SystemConnector.tadirInterface).toHaveBeenCalledWith({ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG', devclass: staging, srcsystem: 'TRM' });
        expect(cleanupTransport.entries).toEqual(expect.arrayContaining([
            { pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG' },
            { pgmid: 'R3TR', object: 'DEVC', objName: staging }
        ]));
        expect(context.revert.cleanupSucceeded).not.toBe(false);
    });

    test('a namespace refusing the staging package falls back to a customer staging package', async () => {
        const context = makeContext(registryDelete);
        context.revert.sapPackages = [];
        context.revert.namespace = undefined;
        context.revert.importedEntries = [{ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG' }];
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValueOnce([{ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG', devclass: '/NS/ORIGINAL' }]);
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ trnspacet: { namespace: '/NS/' } });
        (SystemConnector.createPackage as jest.Mock).mockImplementation(async (pkg: any) => {
            if (pkg.devclass.startsWith('/NS/')) {
                throw new Error('No valid change license exists for namespace /NS/');
            }
        });
        cleanupTransport.addObjects = jest.fn(async function (entries: any[]) { this.entries.push(...entries); });

        await deleteImportedEntries(context);

        const staging = context.revert.stagingPackages.find((devclass: string) => devclass.startsWith('ZTRM_DELE_'));
        expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(expect.objectContaining({ objName: '/NS/PROG', devclass: staging }));
        expect(cleanupTransport.entries).toContainEqual({ pgmid: 'R3TR', object: 'DEVC', objName: staging });
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.createPackage as jest.Mock).mockReset();
    });

    test('an object that cannot be staged does not stop the cleanup of the others', async () => {
        const context = makeContext(registryDelete);
        context.revert.sapPackages = ['ZGEN'];
        context.revert.namespace = undefined;
        context.revert.importedEntries = [{ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG' }];
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValueOnce([{ pgmid: 'R3TR', object: 'PROG', objName: '/NS/PROG', devclass: '/NS/ORIGINAL' }]);
        (SystemConnector.tadirInterface as jest.Mock).mockImplementation(async (object: any) => {
            if (object.objName === '/NS/PROG') {
                throw new Error('Object PROG /NS/PROG cannot be assigned to package');
            }
        });
        cleanupTransport.addObjects = jest.fn(async function (entries: any[]) {
            if (entries.some(entry => entry.objName === '/NS/PROG')) {
                throw new Error('Package /NS/ORIGINAL does not exist');
            }
            this.entries.push(...entries);
        });

        await expect(deleteImportedEntries(context)).rejects.toThrow('Package /NS/ORIGINAL does not exist');

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Could not stage R3TR PROG /NS/PROG'));
        expect(cleanupTransport.entries).toContainEqual({ pgmid: 'R3TR', object: 'DEVC', objName: 'ZGEN' });
        (SystemConnector.tadirInterface as jest.Mock).mockReset();
    });

    test('temporary imported package uses dedicated deletion API and is omitted from cleanup transport', async () => {
        const context = makeContext(registryDelete);
        context.revert.sapPackages = [];
        context.revert.importedEntries = [
            { pgmid: 'R3TR', object: 'DEVC', objName: '$TMP' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_TMP_PROGRAM' }
        ];

        await deleteImportedEntries(context);

        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenCalledWith('$TMP');
        expect(cleanupTransport.addObjects).toHaveBeenCalledWith([
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_TMP_PROGRAM' },
            { pgmid: 'R3TR', object: 'NSPC', objName: '/TEST/' }
        ], false);
        expect(cleanupTransport.addObjects.mock.calls[0][0]).not.toContainEqual(
            { pgmid: 'R3TR', object: 'DEVC', objName: '$TMP' }
        );
    });

    test('reports denied workbench cleanup after attempting every temporary-package cleanup', async () => {
        const context = makeContext(registryDelete);
        context.revert.sapPackages = ['$TMP', '$OTHER'];
        const authorizationError = new RegistryDeletionTransportUnauthorizedError('registry', new Error('denied'));
        registryDelete.mockRejectedValue(authorizationError);
        (SystemConnector.deleteTemporaryPackage as jest.Mock)
            .mockRejectedValueOnce(new Error('first temporary cleanup failed'))
            .mockResolvedValueOnce(undefined);

        await expect(deleteImportedEntries(context)).rejects.toBe(authorizationError);

        // The released cleanup transport can't be deleted: the authorization error is reported as is.
        expect(cleanupTransport.delete).not.toHaveBeenCalled();
        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenNthCalledWith(1, '$TMP');
        expect(SystemConnector.deleteTemporaryPackage).toHaveBeenNthCalledWith(2, '$OTHER');
        expect(context.revert.cleanupImported).toBe(true);
        expect(context.revert.cleanupSucceeded).toBe(false);
    });

    test('rollback cleanup does not overwrite the upgrade deletion transport snapshot', async () => {
        const context = makeContext(registryDelete);
        const upgradeSnapshot = {
            trkorr: 'DEVK9UPGRADE',
            entries: undefined,
            binaries: { header: Buffer.from('old-h'), data: Buffer.from('old-d') }
        };
        context.revert.dele = upgradeSnapshot;
        const laterFailure = { name: 'later', run: async () => { throw new Error('later'); } };

        await expect(execute('test', [importBatch, laterFailure], context)).rejects.toThrow();

        expect(context.revert.dele).toBe(upgradeSnapshot);
        expect(context.runtime.dele.trkorr).toBe('DEVK9CLEAN');
    });

    test('snapshots package transport layers before finalization edits', async () => {
        const context = makeContext(registryDelete);
        context.runtime.update = { getDevclass: () => 'ZROOT' };
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue({ devclass: 'ZROOT', pdevclass: 'OLD_LAYER' });
        await importBatch.run(context);

        expect(context.revert.packageTransportLayers).toEqual([
            { devclass: 'ZROOT', transportLayer: 'OLD_LAYER' },
            { devclass: 'ZSUB', transportLayer: 'OLD_LAYER' }
        ]);
        context.revert.cleanupImported = true;
        context.revert.cleanupSucceeded = true;
        await cleanupCheckpoint.revert(context);
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZROOT', 'OLD_LAYER');
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZSUB', 'OLD_LAYER');
    });

    test('does not restore layers for packages created by a first install', async () => {
        const context = makeContext(registryDelete);
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue({ devclass: 'ZROOT', pdevclass: 'SOURCE_LAYER' });

        await importBatch.run(context);

        expect(context.revert.packageTransportLayers || []).toEqual([]);
    });

    test('an existing cleanup transport is reused rather than replaced', async () => {
        const context = makeContext(registryDelete);
        context.revert.cleanupTransport = cleanupTransport;
        failurePoint = 'connect';
        const restore = { name: 'restore', run: async () => undefined, revert: async () => undefined };

        await expect(execute('test', [restore, importBatch], context)).rejects.toThrow();

        expect(Transport.createToc).not.toHaveBeenCalled();
        expect(context.revert.cleanupTransport).toBe(cleanupTransport);
        expect(cleanupTransport.addObjects).toHaveBeenCalledTimes(1);
    });

    test('cleanup transport creation happens during revert after import and blocks old payload restore on failure', async () => {
        failurePoint = 'cleanup.createToc';
        const context = makeContext(registryDelete);
        const restore = {
            name: 'restore',
            run: async () => undefined,
            revert: async () => {
                if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                    events.push('restore-old-payload');
                }
            }
        };

        const laterFailure = { name: 'later', run: async () => { throw new Error('later'); } };
        await expect(execute('test', [restore, importBatch, laterFailure], context)).rejects.toThrow();

        expect(Transport.importMultiple).toHaveBeenCalledTimes(1);
        expect(registryDelete).not.toHaveBeenCalled();
        expect(context.revert.cleanupSucceeded).toBe(false);
        expect(events).not.toContain('restore-old-payload');
    });

    test('failure adding checkpoint entries during revert blocks old payload restore', async () => {
        failurePoint = 'cleanup.addObjects';
        const context = makeContext(registryDelete);
        const restore = {
            name: 'restore',
            run: async () => undefined,
            revert: async () => {
                if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                    events.push('restore-old-payload');
                }
            }
        };

        const laterFailure = { name: 'later', run: async () => { throw new Error('later'); } };
        await expect(execute('test', [restore, importBatch, laterFailure], context)).rejects.toThrow();

        expect(Transport.importMultiple).toHaveBeenCalledTimes(1);
        expect(registryDelete).not.toHaveBeenCalled();
        expect(cleanupTransport.delete).toHaveBeenCalledTimes(1);
        expect(context.revert.cleanupSucceeded).toBe(false);
        expect(events).not.toContain('restore-old-payload');
    });

    describe.each(['allowed', 'denied'] as RegistryOutcome[])('alternate finalization branches with deletion %s', outcome => {
        test('failure clearing an imported root package is cleaned first', async () => {
            const context = makeContext(registryDelete);
            context.runtime.rootDevclassBeforeImport.parentcl = '';
            failurePoint = 'clearPackageSuperpackage';
            if (outcome === 'denied') {
                registryDelete.mockRejectedValue(new RegistryDeletionTransportUnauthorizedError('registry', new Error('denied')));
            }
            const restore = {
                name: 'restore', run: async () => undefined,
                revert: async () => {
                    if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                        events.push('restore-old-payload');
                    }
                }
            };

            await expect(execute('test', [restore, importBatch], context)).rejects.toThrow();

            expect(registryDelete).toHaveBeenCalledTimes(1);
            if (outcome === 'allowed') {
                expect(events.indexOf('registry.delete')).toBeLessThan(events.indexOf('restore-old-payload'));
            } else {
                expect(events).not.toContain('restore-old-payload');
            }
        });

        test('failure clearing a promoted replacement root is cleaned first', async () => {
            const context = makeContext(registryDelete);
            context.rawInput.installData.installDevclass.keepOriginal = false;
            context.rawInput.installData.installDevclass.replacements = [
                { originalDevclass: 'ZROOT', installDevclass: 'ZNEWROOT' }
            ];
            context.runtime.update = { getDevclass: () => 'ZOLDROOT' };
            failurePoint = 'clearPackageSuperpackage';
            if (outcome === 'denied') {
                registryDelete.mockRejectedValue(new RegistryDeletionTransportUnauthorizedError('registry', new Error('denied')));
            }
            const restore = {
                name: 'restore', run: async () => undefined,
                revert: async () => {
                    if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                        events.push('restore-old-payload');
                    }
                }
            };

            await expect(execute('test', [restore, importBatch], context)).rejects.toThrow();

            expect(registryDelete).toHaveBeenCalledTimes(1);
            if (outcome === 'allowed') {
                expect(events.indexOf('registry.delete')).toBeLessThan(events.indexOf('restore-old-payload'));
            } else {
                expect(events).not.toContain('restore-old-payload');
            }
        });
    });

    test.each([
        'cleanup.getE071',
        'cleanup.release',
        'cleanup.download',
        'cleanup.upload',
        'cleanup.import.test',
        'cleanup.import.live',
        'registry.delete',
        'cleanup.canBeDeleted',
        'deleteTemporaryPackage'
    ])('failure during %s prevents restoration of old payloads', async point => {
        const context = await runFailure(point, 'allowed', true);

        expect(context.revert.cleanupImported).toBe(true);
        expect(context.revert.cleanupSucceeded).toBe(false);
        expect(events).not.toContain('restore-old-payload');
    });

    test('failure deleting a failed cleanup checkpoint blocks earlier payload restoration', async () => {
        failurePoint = 'cleanup.delete';
        const context = makeContext(registryDelete);
        context.revert.cleanupTransport = cleanupTransport;
        cleanupTransport.addObjects.mockRejectedValue(new Error('checkpoint add failed'));
        const restore = {
            name: 'restore', run: async () => undefined,
            revert: async () => {
                if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                    events.push('restore-old-payload');
                }
            }
        };

        const laterFailure = { name: 'later', run: async () => { throw new Error('later'); } };
        await expect(execute('test', [restore, importBatch, laterFailure], context)).rejects.toThrow();

        expect(events).toContain('cleanup.delete');
        expect(events).not.toContain('restore-old-payload');
    });

    describe('objects already on the system before the import', () => {
        let backupTransport: any;

        function makeExistingContext() {
            const context = makeContext(registryDelete);
            context.runtime.transports.tadir.binaries.entries.e071 = [
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' },
                { pgmid: 'R3TR', object: 'TABL', objName: 'Z_EXISTING_TABLE' },
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL' },
                { pgmid: 'LIMU', object: 'REPS', objName: 'Z_ONE' }
            ];
            context.runtime.transports.devc.binaries.entries.e071 = [
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT' },
                { pgmid: 'R3TR', object: 'DEVC', objName: '$LOCAL' },
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZGENERATED' },
                { pgmid: 'R3TR', object: 'NSPC', objName: '/TEST/' }
            ];
            context.runtime.transports.lang = undefined;
            context.runtime.transports.cust = [];
            context.revert.sapPackages = ['ZGENERATED'];
            return context;
        }

        const existingTadir = [
            { pgmid: 'R3TR', object: 'TABL', objName: 'Z_EXISTING_TABLE', devclass: 'ZCUSTOMER', srcsystem: 'DEV', author: 'USER' },
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT', devclass: 'ZROOT', srcsystem: 'DEV', author: 'USER' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'Z_LOCAL', devclass: '$LOCAL', srcsystem: 'DEV', author: 'USER' },
            { pgmid: 'R3TR', object: 'DEVC', objName: '$LOCAL', devclass: '$LOCAL', srcsystem: 'DEV', author: 'USER' }
        ];

        beforeEach(() => {
            backupTransport = {
                trkorr: 'DEVK9BKP',
                addObjects: jest.fn(async () => fail('backup.addObjects')),
                release: jest.fn(async () => fail('backup.release')),
                download: jest.fn(async () => {
                    await fail('backup.download');
                    return { binaries: { header: Buffer.from('bh'), data: Buffer.from('bd') } };
                }),
                delete: jest.fn(async () => fail('backup.delete')),
                canBeDeleted: jest.fn(async () => {
                    await fail('backup.canBeDeleted');
                    return true;
                })
            };
            jest.spyOn(Transport, 'createToc').mockImplementation(async (data: any) => {
                if (data.text.includes('(BKP)')) {
                    await fail('backup.createToc');
                    return backupTransport;
                }
                await fail('cleanup.createToc');
                return cleanupTransport;
            });
            jest.spyOn(Transport, 'upload').mockImplementation(async (trkorr: string) => {
                const name = trkorr === 'DEVK9BKP' ? 'backup' : 'cleanup';
                await fail(`${name}.upload`);
                return {
                    trkorr,
                    import: async (test: boolean) => fail(test ? `${name}.import.test` : `${name}.import.live`)
                } as unknown as Transport;
            });
            (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async (objects: any[]) => {
                await fail('getExistingObjects');
                return existingTadir.filter(existing => objects.some(object => object.object === existing.object && object.objName === existing.objName));
            });
        });

        async function runExisting(point: string, failAfterStep = true): Promise<any> {
            failurePoint = point;
            const context = makeExistingContext();
            const restore = {
                name: 'prepared-transport',
                run: async () => undefined,
                revert: async () => {
                    if (!context.revert.cleanupImported || context.revert.cleanupSucceeded) {
                        events.push('restore-old-payload');
                    }
                }
            };
            const laterFailure = { name: 'later-failure', run: async () => { throw new Error('failure after importBatch'); } };
            await expect(execute('test', failAfterStep ? [restore, importBatch, laterFailure] : [restore, importBatch], context)).rejects.toThrow();
            return context;
        }

        test('only imported R3TR objects not generated by the install are checked', async () => {
            const context = makeExistingContext();
            await importBatch.run(context);

            const checked = (SystemConnector.getExistingObjects as jest.Mock).mock.calls[0][0].map((o: any) => `${o.object} ${o.objName}`);
            expect(checked).toEqual(['PROG Z_ONE', 'TABL Z_EXISTING_TABLE', 'PROG Z_LOCAL', 'DEVC ZROOT', 'DEVC $LOCAL']);
        });

        test('existing objects and packages are backed up before the import', async () => {
            const context = makeExistingContext();
            await importBatch.run(context);

            expect(backupTransport.addObjects).toHaveBeenCalledWith([
                { pgmid: 'R3TR', object: 'TABL', objName: 'Z_EXISTING_TABLE' },
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT' }
            ], false);
            expect(events.indexOf('backup.release')).toBeLessThan(events.indexOf('importMultiple'));
            expect(context.revert.existingObjectsBackup.trkorr).toBe('DEVK9BKP');
            expect(context.revert.existingObjectsTadir).toEqual(existingTadir);
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('Z_LOCAL'), { important: true });
        });

        test('rollback keeps existing objects out of the cleanup and restores them after it', async () => {
            const context = await runExisting('unused');

            const entries = cleanupTransport.addObjects.mock.calls[0][0];
            expect(entries).toEqual(expect.arrayContaining([
                { pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' },
                { pgmid: 'LIMU', object: 'REPS', objName: 'Z_ONE' },
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZGENERATED' },
                { pgmid: 'R3TR', object: 'NSPC', objName: '/TEST/' }
            ]));
            expect(entries).toHaveLength(4);
            expect(SystemConnector.deleteTemporaryPackage).not.toHaveBeenCalledWith('$LOCAL');
            expect(context.revert.cleanupSucceeded).toBe(true);
            expect(events.indexOf('cleanup.import.live')).toBeLessThan(events.indexOf('backup.import.live'));
            expect(events.indexOf('backup.import.live')).toBeLessThan(events.indexOf('restore-old-payload'));
            for (const object of existingTadir) {
                expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(object);
            }
        });

        test.each([
            'cleanup.addObjects',
            'registry.delete',
            'cleanup.import.live'
        ])('a failed cleanup at %s does not restore the backup over the imported objects', async point => {
            const context = await runExisting(point);

            expect(context.revert.cleanupSucceeded).toBe(false);
            expect(events).not.toContain('backup.upload');
            expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('DEVK9BKP'), { important: true });
        });

        test('a failed backup restore still restores the TADIR rows and surfaces the failure', async () => {
            const context = makeExistingContext();
            failurePoint = 'backup.import.live';
            const laterFailure = { name: 'later-failure', run: async () => { throw new Error('later'); } };

            await expect(execute('test', [importBatch, laterFailure], context)).rejects.toThrow('later');

            expect(events).toContain('backup.import.live');
            for (const object of existingTadir) {
                expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(object);
            }
        });

        test('a failed backup restore is reported by the step revert', async () => {
            const context = makeExistingContext();
            await importBatch.run(context);
            failurePoint = 'backup.import.live';

            await expect(importBatch.revert(context)).rejects.toThrow('failure at backup.import.live');

            expect(context.revert.cleanupSucceeded).toBe(true);
            expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(existingTadir[0]);
        });

        test.each([
            'getExistingObjects',
            'backup.createToc',
            'backup.release',
            'backup.download'
        ])('a failure backing up at %s aborts before the import and leaves existing objects alone', async point => {
            const context = await runExisting(point, false);

            expect(Transport.importMultiple).not.toHaveBeenCalled();
            expect(events).not.toContain('backup.upload');
            const entries = cleanupTransport.addObjects.mock.calls[0]?.[0] || [];
            expect(entries).not.toContainEqual({ pgmid: 'R3TR', object: 'PROG', objName: 'Z_ONE' });
            expect(entries).not.toContainEqual({ pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT' });
            expect(entries).toContainEqual({ pgmid: 'R3TR', object: 'DEVC', objName: 'ZGENERATED' });
            if (point === 'backup.release') {
                expect(backupTransport.delete).toHaveBeenCalled();
            }
            expect(context.revert.cleanupSucceeded).toBe(true);
        });

        test('no backup transport is created when every existing object is refused', async () => {
            const context = makeExistingContext();
            backupTransport.addObjects.mockRejectedValue(new Error('not transportable'));

            await importBatch.run(context);

            expect(backupTransport.delete).toHaveBeenCalledTimes(1);
            expect(backupTransport.release).not.toHaveBeenCalled();
            expect(context.revert.existingObjectsBackup).toBeUndefined();
            expect(context.revert.existingObjectsBackupTransport).toBeUndefined();
            expect(context.revert.existingObjectsTadir).toEqual(existingTadir);
        });
    });
});

describe('importBatch package transport layers', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'success', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.getSupportedBulk as jest.Mock).mockReturnValue({});
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);
    });

    function layerContext() {
        const context = makeContext(jest.fn());
        context.rawInput.installData.installDevclass.transportLayer = undefined;
        context.runtime.transports.lang.instance = undefined;
        context.runtime.transports.cust = [];
        return context;
    }

    test('packages kept with their original name get the system default layer, read before the import', async () => {
        const events: string[] = [];
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockImplementation(async () => { events.push('default'); return 'ZDEF'; });
        (Transport.importMultiple as jest.Mock).mockImplementation(async () => { events.push('import'); });

        await importBatch.run(layerContext());

        expect(events).toEqual(['default', 'import']);
        expect(SystemConnector.getDefaultTransportLayer).toHaveBeenCalledTimes(1);
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZROOT', 'ZDEF');
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZSUB', 'ZDEF');
    });

    test('a package already on the system keeps its layer, read before the import overwrites it', async () => {
        const context = layerContext();
        context.runtime.update = { getDevclass: () => 'ZROOT' };
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === 'ZROOT' ? { devclass, pdevclass: 'ZOLD' } : undefined);
        (Transport.importMultiple as jest.Mock).mockImplementation(async () => {
            (SystemConnector.getDevclass as jest.Mock).mockResolvedValue({ devclass: 'ZROOT', pdevclass: 'SOURCE' });
        });
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue('ZDEF');

        await importBatch.run(context);

        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZROOT', 'ZOLD');
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZSUB', 'ZDEF');
        expect(context.revert.packageTransportLayers).toEqual([{ devclass: 'ZROOT', transportLayer: 'ZOLD' }]);
    });

    test('the input layer wins and no default is read', async () => {
        const context = layerContext();
        context.rawInput.installData.installDevclass.transportLayer = 'ZIN';

        await importBatch.run(context);

        expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZROOT', 'ZIN');
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('ZSUB', 'ZIN');
    });

    test('a system without a default layer fails before anything is imported', async () => {
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue('');

        await expect(importBatch.run(layerContext())).rejects.toThrow('System has no default transport layer, specify one.');

        expect(Transport.importMultiple).not.toHaveBeenCalled();
        expect(SystemConnector.setPackageTransportLayer).not.toHaveBeenCalled();
    });

    test('local packages get no transport layer', async () => {
        const context = layerContext();
        context.runtime.transports.devc.binaries.entries.tdevc = [{ devclass: '$ROOT' }];
        context.runtime.package.hierarchy.devclass = '$ROOT';

        await importBatch.run(context);

        expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
        expect(SystemConnector.setPackageTransportLayer).toHaveBeenCalledWith('$ROOT', '');
    });
});
