jest.mock('./getSystemEngines', () => ({
    ...jest.requireActual('./getSystemEngines'),
    getSystemEngines: jest.fn()
}));

import { Inquirer, Logger } from 'trm-commons';
import { RegistryType } from '../../registry';
import { ENGINES_TEMPLATE, getSystemEngines } from './getSystemEngines';
import { setManifestValues } from './setManifestValues';

const systemEnginesMock = getSystemEngines as jest.Mock;
const SYSTEM_ENGINES = { components: { SAP_BASIS: [{ release: '758', sp: '>=2' }, { release: '>758' }] } };

function context(options: { noInquirer?: boolean, engines?: any, latestEngines?: any } = {}) {
    return {
        rawInput: {
            contextData: { noInquirer: !!options.noInquirer },
            publishData: { keepLatestReleaseManifestValues: true },
            packageData: {
                registry: { getRegistryType: () => RegistryType.LOCAL, endpoint: 'local' }
            }
        },
        runtime: {
            manifest: { name: 'test', version: '1.0.0', dependencies: [], postActivities: [], sapEntries: {}, engines: options.engines },
            latest: { data: options.latestEngines ? { manifest: { name: 'test', version: '0.9.0', engines: options.latestEngines } } : undefined },
            sapPackage: {}
        },
        output: {}
    } as any;
}

/**
 * Mocks Inquirer.prompt: multi-question prompts (other manifest values) answer nothing,
 * engines prompts answer from the given map.
 */
function mockPrompt(answers: Record<string, any>) {
    const questions: any[] = [];
    jest.spyOn(Inquirer, 'prompt').mockImplementation(async (q: any) => {
        if (Array.isArray(q)) {
            if (q[0]?.name !== 'editAnyOf') {
                return {};
            }
            questions.push(...q);
            return answers.editAnyOf ? { editAnyOf: true, anyOf: answers.anyOf } : { editAnyOf: false };
        }
        if (q.ui && !(q.name in answers)) {
            questions.push(q);
            return { [q.name]: q.ui.value };
        }
        questions.push(q);
        return { [q.name]: answers[q.name] };
    });
    return questions;
}

describe('publish setManifestValues engines prompt', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['log', 'loading', 'error', 'warning', 'info'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        jest.spyOn(Inquirer, 'isUi').mockReturnValue(false);
        systemEnginesMock.mockResolvedValue(SYSTEM_ENGINES);
    });

    test('UI: declining keeps the engines', async () => {
        (Inquirer.isUi as jest.Mock).mockReturnValue(true);
        const questions = mockPrompt({ editEngines: false });
        const ctx = context({ engines: { components: { SAP_BASIS: true } } });
        await setManifestValues.run(ctx);
        expect(questions.find(q => q.name === 'editEngines').default).toBe(true);
        expect(questions.find(q => q.name === 'components')).toBeUndefined();
        expect(ctx.runtime.manifest.engines).toEqual({ components: { SAP_BASIS: true } });
    });

    test('UI: tables are prefilled with the system engines', async () => {
        (Inquirer.isUi as jest.Mock).mockReturnValue(true);
        const questions = mockPrompt({ editEngines: true });
        const ctx = context();
        await setManifestValues.run(ctx);
        const tables = questions.filter(q => ['components', 'products', 'notes', 'tables'].includes(q.name));
        expect(tables.map(q => q.name)).toEqual(['components', 'products', 'notes', 'tables']);
        expect(tables[0].ui.value).toEqual([{ name: 'SAP_BASIS', notInstalled: false, constraints: [{ release: '758', sp: '>=2' }, { release: '>758' }] }]);
        expect(ctx.runtime.manifest.engines).toEqual(SYSTEM_ENGINES);
    });

    test('UI: the system template starts empty', async () => {
        (Inquirer.isUi as jest.Mock).mockReturnValue(true);
        systemEnginesMock.mockResolvedValue(ENGINES_TEMPLATE);
        const questions = mockPrompt({ editEngines: true });
        const ctx = context();
        await setManifestValues.run(ctx);
        expect(questions.find(q => q.name === 'components').ui.value).toEqual([]);
        expect(ctx.runtime.manifest.engines).toBeUndefined();
    });

    test('UI: table answers and anyOf build the engines', async () => {
        (Inquirer.isUi as jest.Mock).mockReturnValue(true);
        const anyOf = [{ notes: { '3284711': true } }, { components: { SAP_BASIS: { release: '758', sp: '>=3' } } }];
        const questions = mockPrompt({
            editEngines: true,
            components: [{ name: 'S4CORE', notInstalled: true }],
            products: [],
            notes: [{ note: '1234567', version: '>=3' }],
            tables: [{ table: 'TADIR', where: [{ field: 'OBJ_NAME', op: 'LIKE', value: '/UI2/%' }] }],
            editAnyOf: true,
            anyOf: JSON.stringify(anyOf)
        });
        const ctx = context({ engines: { components: { SAP_BASIS: true } } });
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.engines).toEqual({
            components: { S4CORE: false },
            notes: { '1234567': { version: '>=3' } },
            tables: [{ table: 'TADIR', where: [{ field: 'OBJ_NAME', op: 'LIKE', value: '/UI2/%' }] }],
            anyOf
        });
        const components = questions.find(q => q.name === 'components');
        expect(components.validate([{ name: 'SAP_BASIS' }, { name: 'SAP_BASIS' }])).toBe('Duplicate component "SAP_BASIS"');
        const anyOfValidate = questions.find(q => q.name === 'anyOf').validate;
        expect(anyOfValidate('{')).toBe('Invalid JSON');
        expect(anyOfValidate('{}')).toBe('Invalid array');
        expect(anyOfValidate('[]')).toBe(true);
        expect(anyOfValidate(JSON.stringify([{ component: {} }]))).not.toBe(true);
    });

    test('no prompt without inquirer', async () => {
        const questions = mockPrompt({ editEngines: true });
        const ctx = context({ noInquirer: true, engines: { components: { SAP_BASIS: true } } });
        await setManifestValues.run(ctx);
        expect(questions).toHaveLength(0);
        expect(ctx.runtime.manifest.engines).toEqual({ components: { SAP_BASIS: true } });
    });

    test('declining keeps the manifest without engines and does not read the system', async () => {
        const questions = mockPrompt({ editEngines: false });
        const ctx = context();
        await setManifestValues.run(ctx);
        expect(questions.find(q => q.name === 'editEngines').default).toBe(false);
        expect(questions.find(q => q.name === 'engines')).toBeUndefined();
        expect(systemEnginesMock).not.toHaveBeenCalled();
        expect(ctx.runtime.manifest.engines).toBeUndefined();
    });

    test('accepting prefills the editor with the system engines and stores the edited value', async () => {
        const edited = { components: { SAP_BASIS: { release: '>=750' } } };
        const questions = mockPrompt({ editEngines: true, engines: JSON.stringify(edited) });
        const ctx = context();
        await setManifestValues.run(ctx);
        const editor = questions.find(q => q.name === 'engines');
        expect(editor.type).toBe('editor');
        expect(JSON.parse(editor.default)).toEqual(SYSTEM_ENGINES);
        expect(ctx.runtime.manifest.engines).toEqual(edited);
        expect(ctx.runtime.manifestXml).toContain('<ENGINES>');
    });

    test('an empty object removes engines', async () => {
        mockPrompt({ editEngines: true, engines: '{}' });
        const ctx = context({ engines: { components: { SAP_BASIS: true } } });
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.engines).toBeUndefined();
    });

    test('existing engines (from the latest release) are the default instead of the system', async () => {
        const latestEngines = { products: { 'ABAP PLATFORM': { version: '>=2022' } } };
        const questions = mockPrompt({ editEngines: true, engines: JSON.stringify(latestEngines) });
        const ctx = context({ latestEngines });
        await setManifestValues.run(ctx);
        expect(questions.find(q => q.name === 'editEngines').default).toBe(true);
        expect(JSON.parse(questions.find(q => q.name === 'engines').default)).toEqual(latestEngines);
        expect(systemEnginesMock).not.toHaveBeenCalled();
    });

    test('editor validation rejects invalid JSON and strict errors', async () => {
        const questions = mockPrompt({ editEngines: true, engines: '{}' });
        await setManifestValues.run(context());
        const validate = questions.find(q => q.name === 'engines').validate;
        expect(validate('{')).toBe('Invalid JSON');
        expect(validate(JSON.stringify({ component: { SAP_BASIS: true } }))).toBe('engines.component: unknown engine check.');
        expect(validate(JSON.stringify({ components: { '<<COMPONENT>>': { release: '<<release range>>' } } }))).not.toBe(true);
        expect(validate(JSON.stringify(SYSTEM_ENGINES))).toBe(true);
    });

    test('non-interactive: an unknown engine check is rejected', async () => {
        const ctx = context({ noInquirer: true, engines: { component: { SAP_BASIS: true } } });
        await expect(setManifestValues.run(ctx)).rejects.toThrow('Invalid engines declaration: engines.component: unknown engine check.');
        expect(ctx.runtime.manifestXml).toBeUndefined();
    });

    test('non-interactive: an unknown constraint property is rejected', async () => {
        const ctx = context({ noInquirer: true, engines: { components: { SAP_BASIS: { releas: '>=758' } } } });
        await expect(setManifestValues.run(ctx)).rejects.toThrow('unknown property "releas"');
    });

    test('non-interactive: engines copied from the latest release are validated strictly', async () => {
        const ctx = context({ noInquirer: true, latestEngines: { components: { SAP_BASIS: true }, future: {} } });
        await expect(setManifestValues.run(ctx)).rejects.toThrow('engines.future: unknown engine check.');
    });

    test('non-interactive: valid engines are normalized and published', async () => {
        const ctx = context({ noInquirer: true, engines: { components: { sap_basis: { release: '>=758' } } } });
        await setManifestValues.run(ctx);
        expect(ctx.runtime.manifest.engines).toEqual({ components: { SAP_BASIS: { release: '>=758' } } });
    });

    test('UI: unedited engines are validated strictly', async () => {
        (Inquirer.isUi as jest.Mock).mockReturnValue(true);
        mockPrompt({ editEngines: false });
        const ctx = context({ engines: { tables: [{ table: 'T000', where: [{ field: 'MANDT', value: '000', operator: 'EQ' }] }] } });
        await expect(setManifestValues.run(ctx)).rejects.toThrow('unknown property "operator"');
    });
});
