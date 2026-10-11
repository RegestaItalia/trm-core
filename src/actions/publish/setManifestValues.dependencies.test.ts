jest.mock('./getSystemEngines', () => ({
    ...jest.requireActual('./getSystemEngines'),
    getSystemEngines: jest.fn(async () => ({}))
}));

import { Inquirer, Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { setManifestValues } from './setManifestValues';

function context(dependencies: any[], noInquirer = true) {
    return {
        rawInput: {
            contextData: { noInquirer },
            publishData: { keepLatestReleaseManifestValues: true },
            packageData: {
                registry: { getRegistryType: () => RegistryType.LOCAL, endpoint: 'local' }
            }
        },
        runtime: {
            manifest: { name: 'test', version: '1.0.0', dependencies, postActivities: [], sapEntries: {} },
            latest: { data: undefined },
            sapPackage: {}
        },
        output: {}
    } as any;
}

/** Records every prompted question and answers nothing, so manifest values stay unchanged. */
function capturePrompts() {
    const questions: any[] = [];
    jest.spyOn(Inquirer, 'prompt').mockImplementation(async (q: any) => {
        questions.push(...(Array.isArray(q) ? q : [q]));
        return Array.isArray(q) ? {} : { [q.name]: q.ui ? q.ui.value : undefined };
    });
    return questions;
}

describe('publish setManifestValues dependency ranges', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(false);
    });

    test('a valid range is published', async () => {
        const ctx = context([{ name: 'dep', version: '^1.0.0' }]);
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.dependencies).toEqual([{ name: 'dep', version: '^1.0.0' }]);
    });

    test.each([[''], ['  '], ['not a range'], [undefined]])('range %p aborts publish instead of being dropped or read as *', async (version) => {
        await expect(setManifestValues.run(context([{ name: 'dep', version }]))).rejects.toThrow(/Invalid version range/);
    });

    test('CLI editor rejects an empty range', async () => {
        const questions = capturePrompts();
        await setManifestValues.run(context([], false));
        const validate = questions.find(q => q.name === 'dependencies').validate;
        expect(validate(JSON.stringify([{ name: 'dep', version: '' }]))).toBe('Invalid semver range "" for dependency "dep"');
        expect(validate(JSON.stringify([{ name: 'dep', version: '^1.0.0' }]))).toBe(true);
        const postActivities = questions.find(q => q.name === 'postActivities').validate;
        expect(postActivities(JSON.stringify([{ name: 'ZCL_ACTIVITY', parameters: [] }]))).toBe(true);
    });

    test('UI table rejects an empty range', async () => {
        (Inquirer.isUi as jest.Mock).mockReturnValue(true);
        const questions = capturePrompts();
        await setManifestValues.run(context([], false));
        const version = questions.find(q => q.name === 'dependencies').ui.columns.find(c => c.name === 'version');
        expect(version.validate('')).toBe('Invalid semver range');
        expect(version.validate('^1.0.0')).toBe(true);
    });
});
