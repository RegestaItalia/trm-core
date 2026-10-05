jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDevclassObjects: jest.fn(),
        getNamespace: jest.fn(),
        getAbapgitSource: jest.fn(),
        getObjectsLocks: jest.fn()
    }
}));
jest.mock('../../validators', () => ({
    validateDevclass: jest.fn(async () => true)
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { validateDevclass } from '../../validators';
import { RegistryPackageNotFoundError, RegistryType } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { init } from './init';

describe('publish devclass resolution', () => {
    const registry = {
        getRegistryType: () => RegistryType.LOCAL,
        compare: () => true,
        getPackage: jest.fn(async () => { throw new RegistryPackageNotFoundError('pkg', 'latest', 'local', undefined); }),
        validatePublish: jest.fn(async () => undefined)
    } as any;

    function context(devclass: string | undefined, systemPackages: TrmPackage[] = []) {
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    version: '1.0.0',
                    devclass,
                    manifest: { dependencies: [], postActivities: [], sapEntries: {} },
                    registry
                },
                contextData: { noInquirer: true, systemPackages },
                publishData: {}
            }
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'info', 'warning', 'error', 'success'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([
            { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_TEST', devclass: 'ZROOT' }
        ]);
        (SystemConnector.getAbapgitSource as jest.Mock).mockRejectedValue(new Error('no abapgit'));
        //the lock check follows the package read: stop there
        (SystemConnector.getObjectsLocks as jest.Mock).mockRejectedValue(new Error('stop'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function run(ctx: any) {
        await init.run(ctx).catch(e => {
            if (!String(e).includes('stop')) {
                throw e;
            }
        });
    }

    test('fails clearly when the devclass is neither supplied nor derivable', async () => {
        await expect(init.run(context(undefined))).rejects.toThrow('packageData.devclass is required');
        expect(SystemConnector.getDevclassObjects).not.toHaveBeenCalled();
    });

    test('derives, normalizes and validates the devclass of a previous publish', async () => {
        const ctx = context(undefined, [new TrmPackage('pkg', registry).setDevclass(' zroot ')]);
        await run(ctx);
        expect(ctx.rawInput.packageData.devclass).toBe('ZROOT');
        expect(validateDevclass).toHaveBeenCalledWith('ZROOT', false);
        expect(SystemConnector.getDevclassObjects).toHaveBeenCalledWith('ZROOT', true);
    });

    test('normalizes and validates a supplied devclass', async () => {
        const ctx = context(' zroot ');
        await run(ctx);
        expect(validateDevclass).toHaveBeenCalledWith('ZROOT', false);
        expect(SystemConnector.getDevclassObjects).toHaveBeenCalledWith('ZROOT', true);
    });

    test('stops when the derived devclass is invalid', async () => {
        (validateDevclass as jest.Mock).mockResolvedValueOnce('ABAP package "ZROOT" does not exist.');
        const ctx = context(undefined, [new TrmPackage('pkg', registry).setDevclass('ZROOT')]);
        await expect(init.run(ctx)).rejects.toThrow('does not exist');
        expect(SystemConnector.getDevclassObjects).not.toHaveBeenCalled();
    });
});
