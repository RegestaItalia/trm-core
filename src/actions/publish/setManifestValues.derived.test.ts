jest.mock('./getSystemEngines', () => ({
    ...jest.requireActual('./getSystemEngines'),
    getSystemEngines: jest.fn(async () => undefined)
}));

import { Inquirer, Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { LOCAL_RESERVED_KEYWORD } from '../../registry/FileSystem';
import { setManifestValues } from './setManifestValues';

function context(registryType: RegistryType, sapNamespace?: any) {
    return {
        rawInput: {
            contextData: { noInquirer: true },
            publishData: {},
            packageData: {
                registry: { getRegistryType: () => registryType, endpoint: 'https://private.example' }
            }
        },
        runtime: {
            manifest: {
                name: 'test', version: '1.0.0', dependencies: [], postActivities: [], sapEntries: {},
                registry: 'https://caller.example',
                namespace: { ns: '/CALLER/', replicense: 'X', texts: [] }
            },
            latest: { data: undefined },
            sapPackage: { namespace: sapNamespace }
        },
        output: {}
    } as any;
}

describe('publish setManifestValues derived fields', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('a caller namespace is dropped when the SAP package has none', async () => {
        const ctx = context(RegistryType.LOCAL);
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.namespace).toBeUndefined();
    });

    test('the namespace is taken from the SAP package', async () => {
        const ctx = context(RegistryType.LOCAL, {
            trnspacet: { namespace: '/TRM/', replicense: '12345678901234567890' },
            trnspacett: [{ descriptn: 'TRM', spras: 'E', owner: 'Owner' }]
        });
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.namespace).toEqual({
            ns: '/TRM/', replicense: '12345678901234567890', texts: [{ description: 'TRM', language: 'E', owner: 'Owner' }]
        });
    });

    test.each([
        [RegistryType.PUBLIC, undefined], //public is the default and is normalized away
        [RegistryType.PRIVATE, 'https://private.example'],
        [RegistryType.LOCAL, LOCAL_RESERVED_KEYWORD]
    ])('the registry is taken from the target registry (%s)', async (registryType, expected) => {
        const ctx = context(registryType);
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.registry).toBe(expected);
    });
});

describe('publish setManifestValues editor change logs', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ['loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(false);
    });

    test('values edited as JSON are logged as JSON', async () => {
        const log = jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'prompt').mockImplementation(async (q: any) => {
            const questions = Array.isArray(q) ? q : [q];
            const answers: any = {};
            for (const question of questions) {
                if (question.type === 'confirm') {
                    answers[question.name] = true;
                } else if (question.name === 'postActivities') {
                    answers.postActivities = '[]';
                } else if (question.name === 'dependencies') {
                    answers.dependencies = '[]';
                } else if (question.name === 'sapEntries') {
                    answers.sapEntries = '{"TADIR":[{"PGMID":"R3TR"}]}';
                } else if (question.name === 'engines') {
                    answers.engines = '{\n  "products": {}\n}';
                }
            }
            return answers;
        });
        const ctx = context(RegistryType.LOCAL);
        ctx.rawInput.contextData.noInquirer = false;
        delete ctx.runtime.manifest.namespace;

        await setManifestValues.run(ctx);

        const messages = log.mock.calls.map(c => String(c[0])).filter(m => m.includes('manually changed'));
        expect(messages.length).toBeGreaterThanOrEqual(4);
        messages.forEach(m => expect(m).not.toContain('[object Object]'));
        expect(messages.find(m => m.startsWith('SAP entries'))).toContain('after -> {"TADIR":[{"PGMID":"R3TR"}]}');
        expect(messages.find(m => m.startsWith('Engines'))).toContain('after -> {"products":{}}');
    });
});
