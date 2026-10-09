import { selectDependencyRelease } from './findInstallRelease';

describe('selectDependencyRelease', () => {
    const trmPackage = { packageName: 'dep' } as any;
    const registry = (versions: string[]) => ({ getPackage: jest.fn(async () => ({ versions })) }) as any;

    test('a prerelease of a higher major does not satisfy a caret range', async () => {
        await expect(selectDependencyRelease(trmPackage, registry(['1.1.0', '1.2.0', '2.0.0-beta.1']), '^1')).resolves.toEqual({ version: '1.2.0' });
    });

    test('a prerelease of the matching major is not selected either, unless the range opts in', async () => {
        await expect(selectDependencyRelease(trmPackage, registry(['1.2.0', '1.3.0-beta.1']), '^1.2.0')).resolves.toEqual({ version: '1.2.0' });
        await expect(selectDependencyRelease(trmPackage, registry(['1.2.0', '1.3.0-beta.1']), '^1.3.0-beta.0')).resolves.toEqual({ version: '1.3.0-beta.1' });
    });

    test('only prereleases in range: the dependency is not found', async () => {
        await expect(selectDependencyRelease(trmPackage, registry(['2.0.0-beta.1']), '^2')).rejects.toThrow('Dependency "dep": releases not found in range ^2.');
    });
});
