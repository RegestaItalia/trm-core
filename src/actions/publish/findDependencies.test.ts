jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getPackageDependencies: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { SystemConnector } from '../../systemConnector';
import { findDependencies } from './findDependencies';

function trmDependency(name: string, version: string) {
    return {
        trmPackage: {
            packageName: name,
            registry: { getRegistryType: () => RegistryType.PUBLIC, endpoint: 'public', name: 'public' },
            manifest: { get: () => ({ name, version }) },
            compareName: (n: string) => n.trim().toUpperCase() === name.toUpperCase()
        }
    };
}

function context(dependencies: any[]) {
    return {
        rawInput: {
            publishData: {},
            packageData: { name: 'pkg', devclass: 'ZPKG' }
        },
        runtime: {
            manifest: { name: 'pkg', version: '1.0.0', dependencies, postActivities: [], sapEntries: {} }
        }
    } as any;
}

describe('publish findDependencies', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        (SystemConnector.getPackageDependencies as jest.Mock).mockResolvedValue({
            trmPackageDependencies: [trmDependency('dep', '2.4.0-rc.0'), trmDependency('other', '1.2.0')],
            abapPackageDependencies: []
        });
    });

    test('detected dependencies are added with the installed version', async () => {
        const ctx = context([]);
        await findDependencies.run(ctx);
        expect(ctx.runtime.manifest.dependencies).toEqual([
            { name: 'dep', version: '^2.4.0-rc.0', registry: undefined },
            { name: 'other', version: '^1.2.0', registry: undefined }
        ]);
    });

    test('declared dependencies keep their range and are not duplicated', async () => {
        const ctx = context([{ name: 'dep', version: '^2.0.0' }]);
        await findDependencies.run(ctx);
        expect(ctx.runtime.manifest.dependencies).toEqual([
            { name: 'dep', version: '^2.0.0' },
            { name: 'other', version: '^1.2.0', registry: undefined }
        ]);
    });

    test('warns when the installed version does not satisfy the declared range', async () => {
        await findDependencies.run(context([{ name: 'dep', version: '^3.0.0' }]));
        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('doesn\'t satisfy declared range "^3.0.0"'), { important: true });
    });

    test('no warning when an installed prerelease satisfies the declared range', async () => {
        await findDependencies.run(context([{ name: 'dep', version: '^2.0.0' }]));
        expect(Logger.warning).not.toHaveBeenCalled();
    });

    test('no warning when the installed version satisfies the declared range', async () => {
        await findDependencies.run(context([{ name: 'other', version: '^1.0.0' }]));
        expect(Logger.warning).not.toHaveBeenCalled();
    });
});
