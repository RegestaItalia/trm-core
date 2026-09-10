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
        canBeDeleted = jest.fn(async () => MockTransport.deletable);
        delete = jest.fn().mockResolvedValue(undefined);
        constructor(public trkorr: string) { MockTransport.instances.push(this); }
    }
    return { Transport: MockTransport };
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
            }
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
});
