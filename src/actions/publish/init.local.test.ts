jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDevclassObjects: jest.fn(),
        getNamespace: jest.fn(),
        getAbapgitSource: jest.fn(),
        getObjectsLocks: jest.fn(),
        getPackageDependencies: jest.fn(async () => ({ trmPackageDependencies: [], abapPackageDependencies: [] }))
    }
}));
jest.mock('../../validators', () => ({
    validateDevclass: jest.fn(async () => true)
}));

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { RegistryType } from '../../registry';
import { init } from './init';

describe('publish version resolution', () => {
    //an existing artifact of another package, with customizing
    const existing = {
        name: 'other',
        dist_tags: { latest: '3.2.1' },
        versions: ['3.2.1'],
        yanked_versions: [],
        manifest: { name: 'other', version: '3.2.1', private: true },
        transports: [{ trkorr: 'TESTK900010', type: 'CUST' }]
    };

    function context(registryType: RegistryType, version?: string, noInquirer: boolean = true) {
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    version,
                    devclass: 'ZROOT',
                    manifest: { dependencies: [], postActivities: [], sapEntries: {} },
                    registry: {
                        getRegistryType: () => registryType,
                        getPackage: jest.fn(async () => existing),
                        validatePublish: jest.fn(async () => undefined)
                    }
                },
                contextData: { noInquirer, systemPackages: [] },
                publishData: { private: true }
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

    test('local overwrite does not read the target file as latest release', async () => {
        const ctx = context(RegistryType.LOCAL);
        await run(ctx);
        expect(ctx.rawInput.packageData.registry.getPackage).not.toHaveBeenCalled();
        expect(ctx.runtime.latest.data).toBeUndefined();
        expect(ctx.rawInput.packageData.version).toBe('1.0.0');
        expect(ctx.rawInput.packageData.registry.validatePublish).toHaveBeenCalledWith('pkg', '1.0.0', true);
    });

    test('local publish keeps the supplied version', async () => {
        const ctx = context(RegistryType.LOCAL, '3.2.1');
        await run(ctx);
        expect(ctx.rawInput.packageData.version).toBe('3.2.1');
    });

    test('remote publish increments the latest release', async () => {
        const ctx = context(RegistryType.PRIVATE);
        await run(ctx);
        expect(ctx.rawInput.packageData.registry.getPackage).toHaveBeenCalledWith('pkg', 'latest');
        expect(ctx.runtime.latest.data).toBe(existing);
        expect(ctx.rawInput.packageData.version).toBe('3.2.2');
    });

    test('prompted version is cleaned before it is stored', async () => {
        const questions: any[] = [];
        jest.spyOn(Inquirer, 'prompt').mockImplementation(async (q: any) => {
            questions.push(...q);
            return { acceptDefaultVersion: false, version: ' v3.3.0 ' };
        });
        const ctx = context(RegistryType.PRIVATE, undefined, false);
        await run(ctx);
        expect(ctx.rawInput.packageData.version).toBe('3.3.0');
        expect(ctx.rawInput.packageData.registry.validatePublish).toHaveBeenCalledWith('pkg', '3.3.0', true);
        const validate = questions.find(q => q.name === 'version').validate;
        expect(validate('v3.2.1')).toBe('Version "3.2.1" is already published.');
        expect(validate('=3.3.0')).toBe(true);
        expect(validate('latest')).toBe('Invalid version');
    });

    test('accepted automatic version is kept', async () => {
        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ acceptDefaultVersion: true });
        const ctx = context(RegistryType.PRIVATE, undefined, false);
        await run(ctx);
        expect(ctx.rawInput.packageData.version).toBe('3.2.2');
    });

    test('a dependency on a local TRM package refuses the publish before any question', async () => {
        const prompt = jest.spyOn(Inquirer, 'prompt');
        (SystemConnector.getPackageDependencies as jest.Mock).mockResolvedValueOnce({
            trmPackageDependencies: [{ trmPackage: { packageName: 'local-dep', registry: { getRegistryType: () => RegistryType.LOCAL } } }],
            abapPackageDependencies: []
        });
        const ctx = context(RegistryType.PRIVATE, undefined, false);
        await expect(init.run(ctx)).rejects.toThrow('Cannot deliver to registry a TRM package with a local TRM package.');
        expect(prompt).not.toHaveBeenCalled();
    });
});
