jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDevclass: jest.fn(),
        getSubpackages: jest.fn(),
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
import { RegistryPackageNotFoundError, RegistryType } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { init } from './init';

describe('publish of an ABAP package nested with another TRM package', () => {
    const registry = {
        getRegistryType: () => RegistryType.LOCAL,
        compare: () => true,
        getPackage: jest.fn(async () => { throw new RegistryPackageNotFoundError('pkg', 'latest', 'local', undefined); }),
        validatePublish: jest.fn(async () => undefined)
    } as any;
    // ZPARENT -> ZCHILD -> ZGRANDCHILD
    const parents: Record<string, string> = { ZPARENT: '', ZCHILD: 'ZPARENT', ZGRANDCHILD: 'ZCHILD' };

    function context(devclass: string, systemPackages: TrmPackage[]) {
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
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass =>
            devclass in parents ? { devclass, parentcl: parents[devclass] } : undefined);
        (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async devclass =>
            Object.keys(parents).filter(sub => {
                for (let p = parents[sub]; p; p = parents[p]) {
                    if (p === devclass) return true;
                }
                return false;
            }).map(sub => ({ devclass: sub, parentcl: parents[sub] })));
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue([
            { pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG', devclass: 'ZPARENT' }
        ]);
        (SystemConnector.getAbapgitSource as jest.Mock).mockRejectedValue(new Error('no abapgit'));
        //the lock check follows the package read: stop there
        (SystemConnector.getObjectsLocks as jest.Mock).mockRejectedValue(new Error('stop'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a package containing the root of another TRM package is refused before any registry check', async () => {
        await expect(init.run(context('ZPARENT', [new TrmPackage('child', registry).setDevclass('ZGRANDCHILD')]))).rejects.toThrow(
            'ABAP package ZPARENT contains package ZGRANDCHILD of TRM package "child": move it out of ZPARENT, or publish from a package that doesn\'t contain it.'
        );
        expect(registry.validatePublish).not.toHaveBeenCalled();
        expect(SystemConnector.getDevclassObjects).not.toHaveBeenCalled();
    });

    test('a package inside the SAP packages of another TRM package is refused', async () => {
        await expect(init.run(context('ZGRANDCHILD', [new TrmPackage('parent', registry).setDevclass('ZPARENT')]))).rejects.toThrow(
            'ABAP package ZGRANDCHILD is part of TRM package "parent" (SAP package ZPARENT): publish from a package outside of it.'
        );
        expect(registry.validatePublish).not.toHaveBeenCalled();
    });

    test('the root package of another TRM package is refused, suggesting a new release of it', async () => {
        await expect(init.run(context('ZCHILD', [new TrmPackage('child', registry).setDevclass('ZCHILD')]))).rejects.toThrow(
            'ABAP package ZCHILD is already published as TRM package "child": publish a new release of "child", or publish from another package.'
        );
    });

    test('a new release of the same TRM package and unrelated TRM packages are allowed', async () => {
        await expect(init.run(context('ZPARENT', [
            new TrmPackage('pkg', registry).setDevclass('ZPARENT'),
            new TrmPackage('other', registry).setDevclass('ZUNRELATED')
        ]))).rejects.toThrow('stop');
        expect(SystemConnector.getDevclassObjects).toHaveBeenCalledWith('ZPARENT', true);
    });
});
