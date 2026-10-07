jest.mock('./getSystemEngines', () => ({
    ...jest.requireActual('./getSystemEngines'),
    getSystemEngines: jest.fn(async () => undefined)
}));

import { Inquirer, Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { setManifestValues } from './setManifestValues';

const LONG_DESCRIPTION = 'd'.repeat(51);
const LONG_URL = `https://example.com/${'a'.repeat(90)}`;

function context(registryType: RegistryType, manifest: any, latestManifest?: any) {
    return {
        rawInput: {
            contextData: { noInquirer: true },
            publishData: { keepLatestReleaseManifestValues: !!latestManifest },
            packageData: {
                registry: { getRegistryType: () => registryType, endpoint: 'https://private.example' }
            }
        },
        runtime: {
            manifest: { name: 'test', version: '1.0.0', dependencies: [], postActivities: [], sapEntries: {}, ...manifest },
            latest: { data: latestManifest ? { manifest: { name: 'test', version: '0.9.0', ...latestManifest } } : undefined },
            sapPackage: {}
        },
        output: {}
    } as any;
}

describe('publish setManifestValues public registry limits', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test.each([
        ['description', { description: LONG_DESCRIPTION }],
        ['website', { website: LONG_URL }],
        ['git', { git: LONG_URL }]
    ])('a non-interactive public publish rejects a %s over the limit', async (field, manifest) => {
        const ctx = context(RegistryType.PUBLIC, manifest);
        await expect(setManifestValues.run(ctx)).rejects.toThrow(`Invalid manifest ${field} for the public registry`);
        expect(ctx.output.trmPackage).toBeUndefined();
    });

    test('values copied from the latest release are checked', async () => {
        const ctx = context(RegistryType.PUBLIC, {}, { description: LONG_DESCRIPTION });
        await expect(setManifestValues.run(ctx)).rejects.toThrow('Invalid manifest description for the public registry: Maximum length: 50 characters.');
    });

    test('values within the limits are accepted', async () => {
        const ctx = context(RegistryType.PUBLIC, { description: 'd'.repeat(50), website: 'https://example.com' });
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.description).toBe('d'.repeat(50));
    });

    test('non-public registries have no limits', async () => {
        const ctx = context(RegistryType.PRIVATE, { description: LONG_DESCRIPTION, website: LONG_URL, git: LONG_URL });
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.description).toBe(LONG_DESCRIPTION);
    });

    test('prompts apply the same limits', async () => {
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(false);
        let validators: { [name: string]: (input: string) => true | string } = {};
        jest.spyOn(Inquirer, 'prompt').mockImplementation(async (q: any) => {
            const questions = Array.isArray(q) ? q : [q];
            questions.filter(o => o.validate && ['description', 'website', 'git'].includes(o.name)).forEach(o => validators[o.name] = o.validate);
            return {};
        });
        const ctx = context(RegistryType.PUBLIC, {});
        ctx.rawInput.contextData.noInquirer = false;
        await setManifestValues.run(ctx);
        expect(validators.description(LONG_DESCRIPTION)).toBe('Maximum length: 50 characters');
        expect(validators.description('d'.repeat(50))).toBe(true);
        expect(validators.website(LONG_URL)).toBe('Maximum length: 100 characters');
        expect(validators.git(LONG_URL)).toBe('Maximum length: 100 characters');
    });
});
