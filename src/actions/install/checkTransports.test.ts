jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getObjectsLocks: jest.fn(),
        getObjectsList: jest.fn(),
        getSupportedBulk: jest.fn(() => ({ getTransportObjects: false, getExistingObjects: false })),
        getExistingObjects: jest.fn(),
        getSubpackages: jest.fn(),
        getDevclass: jest.fn()
    }
}));

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { checkTransports } from './checkTransports';
import { createHash } from 'crypto';

describe('check-transports existing objects with unknown root devclass', () => {
    const existing = { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_FOREIGN', devclass: 'ZOTHER' };

    function context(options: { noInquirer: boolean, noExistingObjects?: boolean }) {
        const entries = {
            DEVC1: { tdevc: [{ devclass: 'ZROOT', parentcl: '' }] },
            TADIR1: {
                e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_FOREIGN' }],
                tadir: [existing]
            }
        };
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    registry: { transportEntries: jest.fn(async (_name, _version, trkorr) => entries[trkorr]) }
                },
                contextData: {
                    noInquirer: options.noInquirer,
                    systemPackages: []
                },
                installData: {
                    import: { noLang: true, noCust: true },
                    checks: { noExistingObjects: options.noExistingObjects }
                }
            },
            runtime: {
                isLocal: false,
                isTrmServer: false,
                isTrmRest: false,
                update: { packageName: 'pkg', getDevclass: () => undefined },
                package: {
                    data: {
                        manifest: { name: 'pkg', version: '2.0.0' },
                        transports: [
                            { trkorr: 'DEVC1', type: 'DEVC' },
                            { trkorr: 'TADIR1', type: 'TADIR' }
                        ]
                    }
                },
                transports: { cust: [] },
                transportEntries: { tdevct: [] }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getObjectsList as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'CLAS' }]);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([existing]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('non-interactive mode fails closed', async () => {
        const prompt = jest.spyOn(Inquirer, 'prompt');
        await expect(checkTransports.run(context({ noInquirer: true }))).rejects.toThrow(
            `Couldn't determine root SAP package for "pkg", 1 object(s) already exist on target system TST`
        );
        expect(prompt).not.toHaveBeenCalled();
    });

    test('non-interactive mode continues when existing objects are explicitly allowed', async () => {
        await expect(checkTransports.run(context({ noInquirer: true, noExistingObjects: true }))).resolves.toBeUndefined();
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('1 object(s) already exist'), { important: true });
        expect((Logger.loading as jest.Mock).mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            'Checking objects support...',
            'Checking whether 1 package object already exists...',
            'Checking ownership of 1 existing object...'
        ]));
    });

    test('SAP packages of the release are not checked: the install packages are chosen later', async () => {
        const ctx = context({ noInquirer: false });
        ctx.runtime.update = undefined;
        (SystemConnector.getExistingObjects as jest.Mock).mockImplementation(async objects => objects.filter((o: any) => o.object === 'DEVC'));
        (SystemConnector.getObjectsList as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'DEVC' }]);
        ctx.rawInput.packageData.registry.transportEntries = jest.fn(async (_name: string, _version: string, trkorr: string) => trkorr === 'TADIR1'
            ? { e071: [{ pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT' }], tadir: [{ pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT', devclass: 'ZROOT' }] }
            : { tdevc: [{ devclass: 'ZROOT', parentcl: '' }] });

        await checkTransports.run(ctx);

        expect(SystemConnector.getExistingObjects).not.toHaveBeenCalled();
        expect(ctx.runtime.existingObjects).toEqual([]);
    });

    test('a first install names the objects that already exist', async () => {
        const ctx = context({ noInquirer: false });
        ctx.runtime.update = undefined;
        await expect(checkTransports.run(ctx)).rejects.toThrow(
            '1 object(s) already exist on target system TST, install without object check (expert mode):\nR3TR CLAS ZCL_FOREIGN'
        );
    });

    test('a first install names the installed TRM package that contains the existing objects', async () => {
        const ctx = context({ noInquirer: false });
        ctx.runtime.update = undefined;
        // ZOTHER is a subpackage of ZOWNER, the root of installed TRM package "owner".
        ctx.rawInput.contextData.systemPackages = [{ packageName: 'owner', getDevclass: () => 'ZOWNER' }];
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass =>
            ({ ZOTHER: { devclass: 'ZOTHER', parentcl: 'ZOWNER' } } as any)[devclass]);
        await expect(checkTransports.run(ctx)).rejects.toThrow(
            '1 object(s) already exist on target system TST, install without object check (expert mode):\n'
            + 'R3TR CLAS ZCL_FOREIGN (TRM package owner)\n'
            + '"owner" still contains these objects: upgrade it to a release that no longer ships them, or uninstall it, then install again.'
        );
    });

    test('interactive mode asks for confirmation', async () => {
        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ ow: false } as any);
        await expect(checkTransports.run(context({ noInquirer: false }))).rejects.toThrow('1 object(s) already exist on target system TST');
        expect(Inquirer.prompt).toHaveBeenCalledTimes(1);
    });
});

describe('check-transports existing objects on update', () => {
    const existing = { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OWN', devclass: 'ZROOT_SUB' };

    function context() {
        const entries = {
            DEVC1: { tdevc: [{ devclass: 'ZROOT', parentcl: '' }] },
            TADIR1: {
                e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OWN' }],
                tadir: [existing]
            }
        };
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    registry: { transportEntries: jest.fn(async (_name, _version, trkorr) => entries[trkorr]) }
                },
                contextData: {
                    noInquirer: true,
                    //a same-named package published to the local registry, listed first
                    systemPackages: [{ packageName: 'pkg', getDevclass: () => 'ZLOCAL' }]
                },
                installData: {
                    import: { noLang: true, noCust: true },
                    checks: {}
                }
            },
            runtime: {
                isLocal: false,
                isTrmServer: false,
                isTrmRest: false,
                update: { packageName: 'pkg', getDevclass: () => 'ZROOT' },
                package: {
                    data: {
                        manifest: { name: 'pkg', version: '2.0.0' },
                        transports: [
                            { trkorr: 'DEVC1', type: 'DEVC' },
                            { trkorr: 'TADIR1', type: 'TADIR' }
                        ]
                    }
                },
                transports: { cust: [] },
                transportEntries: { tdevct: [] }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getObjectsList as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'CLAS' }]);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([existing]);
        (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === 'ZROOT' ? [{ devclass: 'ZROOT_SUB' }] : []
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('uses the root devclass of the package being updated', async () => {
        await expect(checkTransports.run(context())).resolves.toBeUndefined();
        expect(SystemConnector.getSubpackages).toHaveBeenCalledWith('ZROOT');
        expect(Logger.error).not.toHaveBeenCalled();
    });

    describe('an object of the installed release moved to a customer package', () => {
        const moved = { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OWN', devclass: 'ZCUSTOMER' };
        function movedContext(installed: string[] = ['ZCL_OWN']) {
            const ctx = context();
            ctx.runtime.update.getTransport = () => ({ getE071: async () => installed.map(objName => ({ pgmid: 'R3TR', object: 'CLAS', objName })) });
            (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([moved]);
            return ctx;
        }

        test('is overwritten when the user confirms', async () => {
            const ctx = movedContext();
            ctx.rawInput.contextData.noInquirer = false;
            const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ overwriteMoved: true } as any);
            await expect(checkTransports.run(ctx)).resolves.toBeUndefined();
            expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ name: 'overwriteMoved', default: false }));
            expect(Logger.warning).toHaveBeenCalledWith('1 object(s) of the installed release were moved outside its SAP packages:\nR3TR CLAS ZCL_OWN (now in SAP package ZCUSTOMER)', { important: true });
        });

        test('declining aborts the install', async () => {
            const ctx = movedContext();
            ctx.rawInput.contextData.noInquirer = false;
            jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ overwriteMoved: false } as any);
            await expect(checkTransports.run(ctx)).rejects.toThrow('Install aborted.');
        });

        test('without prompts it is refused', async () => {
            await expect(checkTransports.run(movedContext())).rejects.toThrow('Cannot overwrite objects moved outside pkg: confirm interactively, or install with the noExistingObjects check.');
        });

        test('an existing object that the installed release did not ship is still refused', async () => {
            const ctx = movedContext([]);
            ctx.rawInput.contextData.noInquirer = false;
            const prompt = jest.spyOn(Inquirer, 'prompt');
            await expect(checkTransports.run(ctx)).rejects.toThrow('Cannot overwrite existing objects.');
            expect(prompt).not.toHaveBeenCalled();
        });
    });
});

describe('check-transports artifact fallback', () => {
    const artifactBinary = Buffer.from('verified bootstrap artifact');
    const checksum = createHash('sha512').update(artifactBinary).digest('base64');
    const devcEntries = {
        e071: [{ pgmid: 'R3TR', object: 'DEVC', objName: '/ATRM/REST' }],
        tdevc: [{ devclass: '/ATRM/REST', parentcl: '' }],
        tdevct: [],
        tadir: [{ pgmid: 'R3TR', object: 'DEVC', objName: '/ATRM/REST', devclass: '/ATRM/REST' }]
    };
    const tadirEntries = {
        e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: '/ATRM/CL_REST' }],
        tdevc: [],
        tdevct: [],
        tadir: [{ pgmid: 'R3TR', object: 'CLAS', objName: '/ATRM/CL_REST', devclass: '/ATRM/REST' }]
    };

    function context(artifactChecksum = checksum) {
        const artifact = {
            binary: artifactBinary,
            getTransportBinaries: jest.fn().mockResolvedValue([{
                trkorr: 'TRMK900001', type: 'TADIR', entries: tadirEntries,
                binaries: { header: Buffer.from('header'), data: Buffer.from('data') }
            }])
        };
        const registry = {
            transportEntries: jest.fn().mockResolvedValue(devcEntries),
            downloadArtifact: jest.fn().mockResolvedValue(artifact)
        };
        return {
            rawInput: {
                packageData: { name: 'trm-rest', registry },
                contextData: { noInquirer: true, systemPackages: [] },
                installData: { import: { noLang: true, noCust: true }, checks: { noExistingObjects: true } }
            },
            runtime: {
                isLocal: false,
                isTrmServer: false,
                isTrmRest: true,
                update: { packageName: 'trm-rest', getDevclass: () => '/ATRM/REST' },
                package: { data: {
                    checksum: artifactChecksum,
                    manifest: { name: 'trm-rest', version: '6.0.0' },
                    transports: [{ trkorr: 'TRMK9000P0', type: 'DEVC' }]
                } },
                transports: { cust: [] },
                transportEntries: { tdevct: [] }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getObjectsList as jest.Mock).mockResolvedValue([
            { pgmid: 'R3TR', object: 'DEVC' }, { pgmid: 'R3TR', object: 'CLAS' }
        ]);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getSubpackages as jest.Mock).mockResolvedValue([]);
    });

    afterEach(() => jest.restoreAllMocks());

    test('reads a TADIR transport omitted from the registry metadata from the release artifact', async () => {
        const ctx = context();

        await checkTransports.run(ctx);

        expect(ctx.rawInput.packageData.registry.downloadArtifact).toHaveBeenCalledWith('trm-rest', '6.0.0');
        expect(ctx.runtime.transports.tadir.binaries.trkorr).toBe('TRMK900001');
        expect(ctx.runtime.transports.tadir.binaries.binaries.data).toEqual(Buffer.from('data'));
    });

    test('a release without TADIR transport is still refused', async () => {
        const ctx = context();
        ctx.rawInput.packageData.registry.downloadArtifact.mockResolvedValue({ binary: artifactBinary, getTransportBinaries: jest.fn().mockResolvedValue([]) });

        await expect(checkTransports.run(ctx)).rejects.toThrow('Workbench transport (type TADIR) was not found.');
    });

    test('the artifact is not read when the registry metadata lists every transport', async () => {
        const ctx = context();
        ctx.runtime.package.data.transports.push({ trkorr: 'TRMK900020', type: 'TADIR' });
        ctx.rawInput.packageData.registry.transportEntries.mockImplementation(async (_name: string, _version: string, trkorr: string) => trkorr === 'TRMK900020' ? tadirEntries : devcEntries);

        await checkTransports.run(ctx);

        expect(ctx.rawInput.packageData.registry.downloadArtifact).not.toHaveBeenCalled();
    });

    test('the fixed TADIR transport of trm-rest is read from the artifact even when the registry lists it', async () => {
        const ctx = context();
        ctx.runtime.package.data.transports.push({ trkorr: 'TRMK900001', type: 'TADIR' });

        await checkTransports.run(ctx);

        expect(ctx.rawInput.packageData.registry.transportEntries).toHaveBeenCalledTimes(1);
        expect(ctx.rawInput.packageData.registry.transportEntries).not.toHaveBeenCalledWith('trm-rest', '6.0.0', 'TRMK900001');
        expect(ctx.runtime.transports.tadir.binaries.trkorr).toBe('TRMK900001');
        expect(ctx.runtime.transports.tadir.binaries.binaries.data).toEqual(Buffer.from('data'));
        // read once: the release objects aren't counted twice
        expect(ctx.runtime.transports.tadir.binaries.entries.tadir).toHaveLength(1);
    });

    test('refuses an artifact whose checksum differs from the registry', async () => {
        await expect(checkTransports.run(context('different'))).rejects.toThrow('Cannot continue due to security issues.');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('SECURITY ISSUE!'), { important: true });
    });
});

describe('check-transports customizing prompts', () => {
    function context() {
        const entries = {
            DEVC1: { tdevc: [{ devclass: 'ZROOT', parentcl: '' }] },
            TADIR1: {
                e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_NEW' }],
                tadir: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_NEW', devclass: 'ZROOT' }]
            },
            CUST1: { e071: [] },
            CUST2: { e071: [] }
        };
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    registry: { transportEntries: jest.fn(async (_name, _version, trkorr) => entries[trkorr]) }
                },
                contextData: { noInquirer: false, systemPackages: [] },
                installData: {
                    import: { noLang: true },
                    checks: {}
                }
            },
            runtime: {
                isLocal: false,
                isTrmServer: false,
                isTrmRest: false,
                update: undefined,
                package: {
                    data: {
                        manifest: { name: 'pkg', version: '1.1.0' },
                        transports: [
                            { trkorr: 'DEVC1', type: 'DEVC' },
                            { trkorr: 'TADIR1', type: 'TADIR' },
                            { trkorr: 'CUST1', type: 'CUST', description: 'Same text' },
                            { trkorr: 'CUST2', type: 'CUST', description: 'Same text' }
                        ]
                    }
                },
                transports: { cust: [] },
                transportEntries: { tdevct: [] }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getObjectsList as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'CLAS' }]);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('confirm prompts name the transport when descriptions are equal', async () => {
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(false);
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ importCust: true } as any);
        await checkTransports.run(context());
        const messages = prompt.mock.calls.map(c => (c[0] as any).message);
        expect(messages).toEqual([
            'Do you want to import customizing CUST1 "Same text"?',
            'Do you want to import customizing CUST2 "Same text"?'
        ]);
    });

    test('select choices name the transport when descriptions are equal', async () => {
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(true);
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ importCust: ['CUST1', 'CUST2'] } as any);
        await checkTransports.run(context());
        expect((prompt.mock.calls[0][0] as any).choices.map(o => o.name)).toEqual(['CUST1 "Same text"', 'CUST2 "Same text"']);
    });
});

describe('check-transports translation and customizing import options', () => {
    function context(noInquirer: boolean, importOptions: { noLang?: boolean, noCust?: boolean } = {}) {
        const entries = {
            DEVC1: { tdevc: [{ devclass: 'ZROOT', parentcl: '' }] },
            TADIR1: {
                e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_NEW' }],
                tadir: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_NEW', devclass: 'ZROOT' }]
            },
            LANG1: { e071: [] },
            CUST1: { e071: [] },
            CUST2: { e071: [] }
        };
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    registry: { transportEntries: jest.fn(async (_name, _version, trkorr) => entries[trkorr]) }
                },
                contextData: { noInquirer, systemPackages: [] },
                installData: {
                    import: importOptions,
                    checks: {}
                }
            },
            runtime: {
                isLocal: false,
                isTrmServer: false,
                isTrmRest: false,
                update: undefined,
                package: {
                    data: {
                        manifest: { name: 'pkg', version: '1.0.0' },
                        transports: [
                            { trkorr: 'DEVC1', type: 'DEVC' },
                            { trkorr: 'TADIR1', type: 'TADIR' },
                            { trkorr: 'LANG1', type: 'LANG' },
                            { trkorr: 'CUST1', type: 'CUST', description: 'First' },
                            { trkorr: 'CUST2', type: 'CUST', description: 'Second' }
                        ]
                    }
                },
                transports: { cust: [] },
                transportEntries: { tdevct: [] }
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.getObjectsList as jest.Mock).mockResolvedValue([{ pgmid: 'R3TR', object: 'CLAS' }]);
        (SystemConnector.getExistingObjects as jest.Mock).mockResolvedValue([]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('unset options without prompts import translations and all customizing', async () => {
        const prompt = jest.spyOn(Inquirer, 'prompt');
        const ctx = context(true);
        await checkTransports.run(ctx);
        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.runtime.transports.lang.binaries.trkorr).toEqual('LANG1');
        expect(ctx.runtime.transports.cust.map(o => o.binaries.trkorr)).toEqual(['CUST1', 'CUST2']);
        expect(ctx.runtime.skippedCust).toEqual([]);
    });

    test('unset options with prompts ask for translations and each customizing transport', async () => {
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(false);
        const prompt = jest.spyOn(Inquirer, 'prompt').mockImplementation(async (q: any) => {
            if (q.name === 'importLang') return { importLang: false };
            return { importCust: q.message.includes('CUST1') };
        });
        const ctx = context(false);
        await checkTransports.run(ctx);
        const questions = prompt.mock.calls.map(c => c[0] as any);
        expect(questions.map(q => q.message)).toEqual([
            'Do you want to import the package translations?',
            'Do you want to import customizing CUST1 "First"?',
            'Do you want to import customizing CUST2 "Second"?'
        ]);
        expect(questions.every(q => q.default === true)).toBe(true);
        expect(ctx.runtime.transports.lang).toBeUndefined();
        expect(ctx.runtime.transports.cust.map(o => o.binaries.trkorr)).toEqual(['CUST1']);
        expect(ctx.runtime.skippedCust).toEqual(['CUST2']);
    });

    test('explicit options are not asked', async () => {
        const prompt = jest.spyOn(Inquirer, 'prompt');
        const skip = context(false, { noLang: true, noCust: true });
        await checkTransports.run(skip);
        expect(skip.runtime.transports.lang).toBeUndefined();
        expect(skip.runtime.transports.cust).toEqual([]);
        expect(skip.runtime.skippedCust).toEqual(['CUST1', 'CUST2']);

        const importAll = context(false, { noLang: false, noCust: false });
        await checkTransports.run(importAll);
        expect(importAll.runtime.transports.lang.binaries.trkorr).toEqual('LANG1');
        expect(importAll.runtime.transports.cust.map(o => o.binaries.trkorr)).toEqual(['CUST1', 'CUST2']);
        expect(prompt).not.toHaveBeenCalled();
    });
});
