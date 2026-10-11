jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDevclass: jest.fn(),
        getSubpackages: jest.fn(),
        getRootDevclass: jest.fn(),
        getTableKeys: jest.fn(),
        getInstalledPackages: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { PackageDependencies } from './PackageDependencies';

describe('PackageDependencies', () => {
    // ZSTRUCT -> ZAPP (published) -> ZAPP_SUB
    const tdevc: Record<string, any> = {
        ZSTRUCT: { devclass: 'ZSTRUCT', parentcl: '', tpclass: '' },
        ZAPP: { devclass: 'ZAPP', parentcl: 'ZSTRUCT', tpclass: '' },
        ZAPP_SUB: { devclass: 'ZAPP_SUB', parentcl: 'ZAPP', tpclass: '' },
        ZOTHER: { devclass: 'ZOTHER', parentcl: '', tpclass: '' }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Logger, 'progressbar').mockReturnValue({ start: jest.fn(), update: jest.fn(), stop: jest.fn() } as any);
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass => tdevc[devclass]);
        (SystemConnector.getSubpackages as jest.Mock).mockImplementation(async devclass => devclass === 'ZAPP' ? [tdevc.ZAPP_SUB] : []);
        (SystemConnector.getRootDevclass as jest.Mock).mockImplementation(async devclass => devclass === 'ZAPP_SUB' || devclass === 'ZAPP' ? 'ZSTRUCT' : devclass);
        (SystemConnector.getTableKeys as jest.Mock).mockResolvedValue([{ fieldname: 'DEVCLASS', position: '1', leng: '30' }]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const devcDependency = (devclass: string) => ({ tabname: 'TDEVC', tabkey: devclass, devclass });

    test('the superpackage of the published package is not a dependency', async () => {
        const dependencies = await new PackageDependencies('ZAPP').setDependencies([
            { object: 'DEVC', objName: 'ZAPP', dependencies: [devcDependency('ZSTRUCT')] },
            { object: 'DEVC', objName: 'ZAPP_SUB', dependencies: [devcDependency('ZAPP')] }
        ] as any);

        expect(dependencies.abapPackageDependencies).toEqual([]);
    });

    test('other objects still depend on packages outside the published tree, superpackages included', async () => {
        const dependencies = await new PackageDependencies('ZAPP').setDependencies([
            { object: 'PROG', objName: 'ZAPP_PROG', dependencies: [{ tabname: 'TADIR', tabkey: 'X', devclass: 'ZSTRUCT' }] },
            { object: 'DEVC', objName: 'ZAPP', dependencies: [devcDependency('ZOTHER')] }
        ] as any);

        expect(dependencies.abapPackageDependencies.map(o => o.abapPackage.devclass)).toEqual(['ZSTRUCT', 'ZOTHER']);
    });
});
