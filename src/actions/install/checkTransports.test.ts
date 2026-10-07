jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getObjectsLocks: jest.fn(),
        getObjectsList: jest.fn(),
        getSupportedBulk: jest.fn(() => ({ getTransportObjects: false, getExistingObjects: false })),
        getExistingObjects: jest.fn(),
        getSubpackages: jest.fn()
    }
}));

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { checkTransports } from './checkTransports';

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
});
