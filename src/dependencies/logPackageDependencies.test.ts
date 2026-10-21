import { RegistryType } from '../registry';
import { getPackageDependenciesTree, TreeTableLog } from './logPackageDependencies';

describe('getPackageDependenciesTree', () => {
    const dependencies: any = {
        devclass: 'ZAPP',
        trmPackageDependencies: [{
            trmPackage: {
                packageName: 'dep',
                manifest: { get: () => ({ version: '1.2.0' }) },
                registry: { getRegistryType: () => RegistryType.PUBLIC }
            },
            foundIn: [{ object: 'CLAS', objName: 'ZCL_A' }, { object: 'PROG', objName: 'ZB' }]
        }],
        abapPackageDependencies: [{
            abapPackage: { devclass: 'ZCUST' },
            isCustomerPackage: true,
            entries: [{
                tableName: 'TADIR',
                dependency: [{
                    tableKey: { PGMID: 'R3TR', OBJECT: 'CLAS', OBJ_NAME: 'ZCL_X' },
                    foundIn: [{ object: 'CLAS', objName: 'ZCL_A' }]
                }]
            }]
        }, {
            abapPackage: { devclass: 'SAPPKG' },
            isCustomerPackage: false,
            entries: [{
                tableName: 'TADIR',
                dependency: [
                    { tableKey: { OBJ_NAME: 'A' }, foundIn: [{ object: 'CLAS', objName: 'ZCL_A' }] },
                    { tableKey: { OBJ_NAME: 'B' }, foundIn: [{ object: 'CLAS', objName: 'ZCL_A' }, { object: 'PROG', objName: 'ZB' }] }
                ]
            }]
        }]
    };

    const tab = (tree: TreeTableLog, index: number) => tree.children[index];

    test('splits the dependencies in tabs with columns', () => {
        const tree = getPackageDependenciesTree(dependencies, { sapEntries: true, trmFoundIn: true });
        expect(tree.layout).toBe('tabs');
        expect(tree.children.map(o => o.columns)).toEqual([
            ['Name', 'Type', 'Version', 'Registry', 'Found in'],
            ['Name', 'Type', 'Found in'],
            ['Name', 'Type', 'Found in']
        ]);
        expect(tab(tree, 0).children[0].cells).toEqual(['dep', 'TRM package', '^1.2.0', 'public', '2']);
        expect(tab(tree, 0).children[0].children.map(o => o.cells)).toEqual([
            ['ZCL_A', 'CLAS', '', '', ''],
            ['ZB', 'PROG', '', '', '']
        ]);
        const cust = tab(tree, 1).children[0];
        expect(cust.cells).toEqual(['ZCUST', 'Package', '1']);
        expect(cust.children[0].children[0].cells).toEqual(['PGMID: R3TR, OBJECT: CLAS, OBJ_NAME: ZCL_X', 'Entry', '1']);
        expect(cust.children[0].children[0].children[0].cells).toEqual(['ZCL_A', 'CLAS', '']);
        // distinct objects across the package entries
        expect(tab(tree, 2).children[0].cells).toEqual(['SAPPKG', 'Package', '2']);
    });

    test('omits optional details', () => {
        const tree = getPackageDependenciesTree(dependencies);
        expect(tab(tree, 0).children[0].children).toEqual([]);
        expect(tab(tree, 2).children).toHaveLength(1);
        expect(tab(tree, 2).children[0].children).toEqual([]);
    });
});
