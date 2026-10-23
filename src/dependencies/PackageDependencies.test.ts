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

    test('keeps the direct package instead of collapsing a dependency to its root package', async () => {
        const directPackage = { devclass: 'ZGARE_BSP', parentcl: 'ZREG_RAB_APP', tpclass: '' };
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async devclass => ({
            ...tdevc[devclass],
            ...(devclass === directPackage.devclass ? directPackage : {})
        }));

        const dependencies = await new PackageDependencies('ZAPP').setDependencies([
            { object: 'SICF', objName: 'SERVICE_A', dependencies: [{ tabname: 'TADIR', tabkey: 'R3TRSICFPARENT', devclass: directPackage.devclass }] }
        ] as any);

        expect(dependencies.abapPackageDependencies.map(o => o.abapPackage.devclass)).toEqual([directPackage.devclass]);
        expect(SystemConnector.getRootDevclass).not.toHaveBeenCalled();
    });

    test('lists every distinct object that references the same TRM package', async () => {
        const trmPackage = {
            packageName: '@regestaitalia/orchestratore',
            registry: {},
            getDevclass: () => '/REG/ORCHESTRATORE',
            compareName: (name: string) => name === '@regestaitalia/orchestratore',
            compareRegistry: () => true
        };
        (SystemConnector.getInstalledPackages as jest.Mock).mockResolvedValue([trmPackage]);

        const dependency = {
            tabname: 'TADIR',
            tabkey: 'R3TRSICFPARENT',
            devclass: '/REG/ORC_LIBRARY',
            trmPackageName: '@regestaitalia/orchestratore',
            trmPackageRegistry: 'public'
        };
        const dependencies = await new PackageDependencies('/REG/TUNECRAFT').setDependencies([
            { object: 'SICF', objName: 'TC_LIBRARY', dependencies: [dependency] },
            { object: 'SICF', objName: 'TC_RUN', dependencies: [dependency] },
            { object: 'SICF', objName: 'TC_BUILD', dependencies: [dependency] }
        ] as any);

        expect(dependencies.trmPackageDependencies[0].foundIn.map(f => ({ object: f.object, objName: f.objName }))).toEqual([
            { object: 'SICF', objName: 'TC_LIBRARY' },
            { object: 'SICF', objName: 'TC_RUN' },
            { object: 'SICF', objName: 'TC_BUILD' }
        ]);
        expect(dependencies.trmPackageDependencies[0].foundIn.every(f => f.references.length === 1 && f.references[0].tableName === 'TADIR')).toBe(true);
    });
});
