jest.mock('./getSystemEngines', () => ({
    ...jest.requireActual('./getSystemEngines'),
    getSystemEngines: jest.fn(async () => undefined)
}));

import { Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { PostActivity } from '../../manifest';
import { setManifestValues } from './setManifestValues';
import { SystemConnector } from '../../systemConnector';

function context(postActivities: any[] | undefined, latestPostActivities: any[]) {
    return {
        rawInput: {
            contextData: { noInquirer: true },
            publishData: { keepLatestReleaseManifestValues: true },
            packageData: {
                registry: { getRegistryType: () => RegistryType.LOCAL, endpoint: 'local' }
            }
        },
        runtime: {
            manifest: { name: 'test', version: '1.0.0', dependencies: [], postActivities, sapEntries: {} },
            latest: { data: { manifest: { name: 'test', version: '0.9.0', postActivities: latestPostActivities } } },
            sapPackage: {}
        },
        output: {}
    } as any;
}

describe('publish setManifestValues post activities merge', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        jest.spyOn(PostActivity, 'exists').mockResolvedValue(true);
        jest.spyOn(SystemConnector, 'getObject').mockResolvedValue(undefined);
    });

    test('an input post activity replaces the latest release one of the same class', async () => {
        const ctx = context(
            [{ name: ' zcl_pa ', parameters: [{ name: 'P1', value: 'new' }] }],
            [{ name: 'ZCL_PA', parameters: [{ name: 'P1', value: 'old' }] }]
        );
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.postActivities).toEqual([{ name: 'ZCL_PA', parameters: [{ name: 'P1', value: 'new' }] }]);
    });

    test('latest release post activities of other classes are kept', async () => {
        const ctx = context(
            [{ name: 'ZCL_PA' }],
            [{ name: 'zcl_pa', parameters: [{ name: 'P1', value: 'old' }] }, { name: 'ZCL_OTHER' }]
        );
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.postActivities).toEqual([{ name: 'ZCL_PA' }, { name: 'ZCL_OTHER' }]);
    });

    test('without input post activities the latest release ones are used', async () => {
        const ctx = context(undefined, [{ name: 'ZCL_PA' }]);
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.postActivities).toEqual([{ name: 'ZCL_PA' }]);
    });
});

describe('publish setManifestValues post activities existence', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('removes post activities whose class does not exist', async () => {
        jest.spyOn(SystemConnector, 'getObject').mockImplementation(async (_pgmid, _object, objName) =>
            objName === 'ZCL_PA' ? { pgmid: 'R3TR', object: 'CLAS', objName } as any : undefined);
        const ctx = context([{ name: 'ZCL_PA' }, { name: 'zcl_missing' }], []);
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.postActivities).toEqual([{ name: 'ZCL_PA' }]);
    });
});

describe('publish setManifestValues post activities shipping', () => {
    const pkg = (name: string, registryType: RegistryType, endpoint: string, devclass: string) => ({
        compareName: (n: string) => n.trim().toUpperCase() === name.toUpperCase(),
        registry: { getRegistryType: () => registryType, endpoint },
        getDevclass: () => devclass
    });
    const devclasses: Record<string, string> = {
        ZCL_OWN: 'ZPKG_SUB',
        ZCL_DEP: 'ZDEP_SUB',
        ZCL_SERVER: 'ZTRM',
        ZCL_TMP: '$TMP',
        ZCL_UNDECLARED: 'ZOTHER'
    };
    const roots: Record<string, string> = { ZPKG_SUB: 'ZPKG', ZDEP_SUB: 'ZDEP', ZTRM: 'ZTRM', $TMP: '$TMP', ZOTHER: 'ZOTHER' };
    var warning: jest.SpyInstance;

    function shippingContext(postActivities: any[], dependencies: any[] = []) {
        const ctx = context(postActivities, []);
        ctx.rawInput.packageData.devclass = 'ZPKG';
        ctx.rawInput.contextData.systemPackages = [
            pkg('dep', RegistryType.PUBLIC, 'public', 'ZDEP'),
            pkg('other', RegistryType.PUBLIC, 'public', 'ZOTHER'),
            pkg('trm-server', RegistryType.PUBLIC, 'public', 'ZTRM')
        ];
        ctx.runtime.manifest.dependencies = dependencies;
        ctx.runtime.sapPackage = {
            objects: [
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZPKG', devclass: 'ZPKG' },
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZPKG_SUB', devclass: 'ZPKG' },
                { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OWN', devclass: 'ZPKG_SUB' }
            ]
        };
        return ctx;
    }

    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        warning = jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        jest.spyOn(PostActivity, 'exists').mockResolvedValue(true);
        jest.spyOn(SystemConnector, 'getObject').mockImplementation(async (_pgmid, _object, objName) =>
            ({ pgmid: 'R3TR', object: 'CLAS', objName, devclass: devclasses[objName] }) as any);
        jest.spyOn(SystemConnector, 'getRootDevclass').mockImplementation(async (devclass) => roots[devclass]);
    });

    const warnedClasses = () => warning.mock.calls.map(c => c[0]).filter(m => m.startsWith('Post activity class')).map(m => m.match(/"([^"]+)"/)[1]);

    test('does not warn for classes of the package, its dependencies or trm-server', async () => {
        const ctx = shippingContext([{ name: 'ZCL_OWN' }, { name: 'ZCL_DEP' }, { name: 'ZCL_SERVER' }], [{ name: 'dep', version: '^1.0.0' }]);
        await setManifestValues.run(ctx);
        expect(warnedClasses()).toEqual([]);
        expect(ctx.runtime.manifest.postActivities).toEqual([{ name: 'ZCL_OWN' }, { name: 'ZCL_DEP' }, { name: 'ZCL_SERVER' }]);
    });

    test('warns for a class in $TMP and keeps it', async () => {
        const ctx = shippingContext([{ name: 'ZCL_TMP' }]);
        await setManifestValues.run(ctx);
        expect(warnedClasses()).toEqual(['ZCL_TMP']);
        expect(warning.mock.calls[0][0]).toContain('"$TMP"');
        expect(ctx.runtime.manifest.postActivities).toEqual([{ name: 'ZCL_TMP' }]);
    });

    test('warns for a class of an installed TRM package that is not a dependency', async () => {
        const ctx = shippingContext([{ name: 'ZCL_UNDECLARED' }, { name: 'ZCL_DEP' }]);
        await setManifestValues.run(ctx);
        expect(warnedClasses()).toEqual(['ZCL_UNDECLARED', 'ZCL_DEP']);
    });

    test('a dependency from another registry does not ship the class', async () => {
        const ctx = shippingContext([{ name: 'ZCL_DEP' }], [{ name: 'dep', version: '^1.0.0', registry: 'https://private.example' }]);
        await setManifestValues.run(ctx);
        expect(warnedClasses()).toEqual(['ZCL_DEP']);
    });
});
