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
