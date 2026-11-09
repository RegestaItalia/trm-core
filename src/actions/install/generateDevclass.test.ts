jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'DEV'),
        getLogonUser: jest.fn(() => 'TESTER'),
        getDevclass: jest.fn(),
        getObjectsLocks: jest.fn(),
        createPackage: jest.fn(),
        tadirInterface: jest.fn(),
        setPackageSuperpackage: jest.fn(),
        clearPackageSuperpackage: jest.fn()
    }
}));

import { Inquirer, Logger } from 'trm-commons';
import { ClientError } from '../../client';
import { SystemConnector } from '../../systemConnector';
import { generateDevclass } from './generateDevclass';

/** The SAP package API can't run on the release (e.g. SAP_BASIS 702 without I_SUPPRESS_DIALOG). */
const unsupported = () => new ClientError('DYN_CALL_PARAM_NOT_FOUND', { class: '', no: '000' }, '', '/ATRM/CREATE_PACKAGE');

function context(options: { noInquirer?: boolean } = {}) {
    return {
        rawInput: {
            packageData: { name: 'pkg' },
            contextData: { noInquirer: options.noInquirer ?? false },
            installData: {
                installDevclass: {
                    keepOriginal: false,
                    replacements: [
                        { originalDevclass: 'ZORIG', installDevclass: 'ZNEW' },
                        { originalDevclass: 'ZORIG_SUB', installDevclass: 'ZNEW_SUB' }
                    ]
                }
            }
        },
        runtime: {
            isTrmServer: false,
            namespace: '',
            transportLayer: 'ZDEV',
            stopWarningShown: true,
            package: { hierarchy: { devclass: 'ZORIG', sub: [{ devclass: 'ZORIG_SUB', sub: [] }] } },
            transports: { devc: { binaries: { entries: { tdevc: [{ devclass: 'ZORIG' }, { devclass: 'ZORIG_SUB', parentcl: 'ZORIG' }] } } } },
            transportEntries: { tdevct: [{ devclass: 'ZORIG', ctext: 'Root' }, { devclass: 'ZORIG_SUB', ctext: 'Sub' }] }
        },
        revert: { sapPackages: [], packageHierarchy: [] }
    } as any;
}

describe('generate-devclass', () => {
    let created: Set<string>;
    let prompt: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning', 'success'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        prompt = jest.spyOn(Inquirer, 'prompt');
        created = new Set();
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) => created.has(devclass) ? { devclass } : undefined);
        (SystemConnector.getObjectsLocks as jest.Mock).mockResolvedValue([]);
        (SystemConnector.createPackage as jest.Mock).mockImplementation(async (data: any) => { created.add(data.devclass); });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('creates the missing packages, tracked for the rollback, and builds the hierarchy', async () => {
        const ctx = context();

        await generateDevclass.run(ctx);

        expect(ctx.revert.sapPackages).toEqual(['ZNEW', 'ZNEW_SUB']);
        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZNEW_SUB', 'ZNEW');
        expect(ctx.runtime.manualSteps).toBeUndefined();
    });

    test('a package the SAP package API cannot create is created by the user, and not deleted by a rollback', async () => {
        (SystemConnector.createPackage as jest.Mock).mockImplementation(async (data: any) => {
            if (data.devclass === 'ZNEW') {
                throw unsupported();
            }
            created.add(data.devclass);
        });
        // first answer: not there yet, asked again; second answer: created
        prompt.mockImplementationOnce(async () => ({ created: true }))
            .mockImplementationOnce(async () => { created.add('ZNEW'); return { created: true }; });
        const ctx = context();

        await generateDevclass.run(ctx);

        expect(prompt).toHaveBeenCalledTimes(2);
        expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Create SAP package ZNEW in SE21 (short text "Root", software component HOME, transport layer ZDEV). Created?'
        }));
        expect(ctx.revert.sapPackages).toEqual(['ZNEW_SUB']);
        expect(SystemConnector.tadirInterface).toHaveBeenCalledWith(expect.objectContaining({ objName: 'ZNEW', srcsystem: 'TRM' }));
        expect(SystemConnector.createPackage).toHaveBeenCalledWith(expect.objectContaining({ devclass: 'ZNEW_SUB' }));
    });

    test('declining the manual creation aborts the install', async () => {
        (SystemConnector.createPackage as jest.Mock).mockRejectedValue(unsupported());
        prompt.mockResolvedValue({ created: false });
        const ctx = context();

        await expect(generateDevclass.run(ctx)).rejects.toThrow("Install aborted: SAP package ZNEW wasn't created.");

        expect(ctx.revert.sapPackages).toEqual([]);
    });

    test('without prompts the install stops with the package to create', async () => {
        (SystemConnector.createPackage as jest.Mock).mockRejectedValue(unsupported());
        const ctx = context({ noInquirer: true });

        await expect(generateDevclass.run(ctx)).rejects.toThrow('Create SAP package ZNEW in SE21 (short text "Root", software component HOME, transport layer ZDEV), then rerun the install');

        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.revert.sapPackages).toEqual([]);
    });

    test('a package created before the call failed stays tracked for the rollback', async () => {
        (SystemConnector.createPackage as jest.Mock).mockImplementation(async (data: any) => {
            created.add(data.devclass);
            throw new ClientError('DYNPRO_SEND_IN_BACKGROUND', { class: '', no: '000' }, '', '/ATRM/CREATE_PACKAGE');
        });
        const ctx = context();

        await generateDevclass.run(ctx);

        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.revert.sapPackages).toEqual(['ZNEW', 'ZNEW_SUB']);
    });

    test('a real error creating a package fails the install', async () => {
        (SystemConnector.createPackage as jest.Mock).mockRejectedValue(new ClientError('TRM_RFC_EXCEPTION', { class: 'PAK', no: '012' }, 'No authorization', '/ATRM/CREATE_PACKAGE'));
        const ctx = context();

        await expect(generateDevclass.run(ctx)).rejects.toThrow('No authorization');

        expect(prompt).not.toHaveBeenCalled();
        // tracked: SAP may have created it
        expect(ctx.revert.sapPackages).toEqual(['ZNEW']);
    });

    test('a superpackage the SAP package API cannot set is a manual step: the install goes on', async () => {
        (SystemConnector.setPackageSuperpackage as jest.Mock).mockRejectedValue(new ClientError('DYNPRO_SEND_IN_BACKGROUND', { class: '', no: '000' }, '', '/ATRM/TDEVC_INTERFACE'));
        (SystemConnector.clearPackageSuperpackage as jest.Mock).mockRejectedValue(new ClientError('DYNPRO_SEND_IN_BACKGROUND', { class: '', no: '000' }, '', '/ATRM/TDEVC_INTERFACE'));
        const ctx = context();

        await generateDevclass.run(ctx);

        expect(ctx.runtime.manualSteps).toEqual(['Set the superpackage of SAP package ZNEW_SUB to ZNEW in SE21.']);
    });

    test('a real error setting a superpackage fails the install', async () => {
        (SystemConnector.setPackageSuperpackage as jest.Mock).mockRejectedValue(new Error('locked'));
        const ctx = context();

        await expect(generateDevclass.run(ctx)).rejects.toThrow('locked');
    });
});
