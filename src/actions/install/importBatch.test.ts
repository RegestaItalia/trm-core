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
        getDevclass: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static createToc = jest.fn();
        static importMultiple = jest.fn();
        static upload = jest.fn();
    }
}));

jest.mock('../../registry', () => ({
    RegistryDeletionTransportUnauthorizedError: class RegistryDeletionTransportUnauthorizedError extends Error {
        constructor(public registryEndpoint: string, public originalError: unknown) {
            super(`Deletion denied by ${registryEndpoint}`);
        }
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { RegistryDeletionTransportUnauthorizedError } from '../../registry';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { deleteImportedEntries, importBatch } from './importBatch';
import { init } from './init';

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
        trkorr: `DEVK90000${index}`
    } as unknown as Transport;
}

function makeContext(registryDelete: jest.Mock) {
    const transports = [0, 1, 2, 3].map(makeImportedTransport);
    return {
        rawInput: {
            packageData: {
                name: 'test-package',
                registry: { delete: registryDelete }
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
        await init.revert(context);
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
});
