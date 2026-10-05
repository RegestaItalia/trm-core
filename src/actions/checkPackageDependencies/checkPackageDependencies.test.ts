jest.mock('../../registry', () => ({
    PUBLIC_RESERVED_KEYWORD: 'public',
    RegistryProvider: { getRegistry: jest.fn((registry?: string) => ({ name: registry || 'public' })) }
}));
jest.mock('../../trmPackage', () => ({
    TrmPackage: class MockTrmPackage {
        static compare = (o1: any, o2: any) => o1.packageName === o2.packageName && o1.registry.name === o2.registry.name;
        constructor(public packageName: string, public registry: any, public manifest?: any) {}
    }
}));

import { Logger } from 'trm-commons';
import { checkPackageDependencies } from '.';

function installed(name: string, manifest?: any) {
    return { packageName: name, registry: { name: 'public' }, manifest } as any;
}

function withVersion(version: any) {
    return { get: () => ({ version }) };
}

function run(dependencies: any[], systemPackages: any[]) {
    return checkPackageDependencies({
        packageData: { manifest: { name: 'test', version: '1.0.0', dependencies } as any },
        contextData: { systemPackages }
    });
}

describe('checkPackageDependencies', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['info', 'log', 'table', 'error', 'loading', 'success'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('reports ok, version mismatch and not found in declaration order', async () => {
        const output = await run([
            { name: 'ok', version: '^1.0.0' },
            { name: 'old', version: '^2.0.0' },
            { name: 'missing', version: '*' }
        ], [installed('ok', withVersion('1.2.0')), installed('old', withVersion('1.0.0'))]);
        expect(output.dependencyStatus.map(o => [o.dependency.name, o.status, o.match])).toEqual([
            ['ok', 'ok', true],
            ['old', 'versionMismatch', false],
            ['missing', 'notFound', false]
        ]);
    });

    test('an installed package without a readable manifest is not reported as not found', async () => {
        const throwing = { get: () => { throw new Error('bad manifest'); } };
        const output = await run([
            { name: 'none', version: '*' },
            { name: 'throws', version: '*' },
            { name: 'garbage', version: '*' }
        ], [installed('none'), installed('throws', throwing), installed('garbage', withVersion('not-a-version'))]);
        expect(output.dependencyStatus.map(o => [o.status, o.match])).toEqual([
            ['manifestUnreadable', false],
            ['manifestUnreadable', false],
            ['manifestUnreadable', false]
        ]);
    });

    test.each([['not a range'], ['>=1.0.0 <'], [''], ['  '], [undefined]])('invalid range %p throws', async (version) => {
        await expect(run([{ name: 'dep', version }], [installed('dep', withVersion('1.0.0'))]))
            .rejects.toThrow(/Invalid version range/);
    });
});
