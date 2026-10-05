import { normalizeEngines, validateEngines } from './validateEngines';

//examples published in the engines guide (trm-docs docs/commons/engines.md): keep in sync
const GUIDE_EXAMPLES: { [name: string]: any } = {
    'structure at a glance': {
        components: {
            SAP_BASIS: { release: '>=750', sp: '>=5' },
            SAP_GWFND: true,
            S4CORE: false
        },
        products: {
            'ABAP PLATFORM': { version: '>=2022 <=2023' }
        },
        notes: {
            '3284711': true,
            '1234567': { version: '>=3' }
        },
        tables: [{
            table: 'SEOCOMPODF',
            where: [
                { field: 'CLSNAME', op: 'EQ', value: '/UI2/CL_JSON' },
                { field: 'CMPNAME', op: 'EQ', value: 'VERSION' },
                { field: 'VERSION', op: 'EQ', value: '1' },
                { field: 'ATTVALUE', op: 'GE', value: '12' }
            ]
        }],
        anyOf: [
            { components: { UI_700: { release: '200', sp: '>=16' } } },
            { components: { SAP_UI: { release: '>=750' } } }
        ]
    },
    'minimum basis': {
        components: { SAP_BASIS: { release: '>=750' } }
    },
    'exact release with minimum sp': {
        components: { SAP_BASIS: { release: '758', sp: '>=2' } }
    },
    'release window': {
        components: { SAP_BASIS: { release: '>=750 <=758' } }
    },
    'ecc only': {
        components: { S4CORE: false, SAP_APPL: true }
    },
    's4 only': {
        components: { S4CORE: true }
    },
    'component alternatives': {
        components: {
            SAP_UI: [
                { release: '750', sp: '>=17' },
                { release: '752', sp: '>=9' },
                { release: '>=753' }
            ]
        }
    },
    'product version': {
        products: { 'ABAP PLATFORM': { version: '>=2022' } }
    },
    'product installed': {
        products: { 'SAP S/4HANA FOUNDATION': true }
    },
    'notes': {
        notes: { '3284711': true, '2934135': { version: '>=5' } }
    },
    'class constant': {
        tables: [{
            table: 'SEOCOMPODF',
            where: [
                { field: 'CLSNAME', value: '/UI2/CL_JSON' },
                { field: 'CMPNAME', value: 'VERSION' },
                { field: 'VERSION', value: '1' },
                { field: 'ATTVALUE', op: 'GE', value: '12' }
            ]
        }]
    },
    'object exists': {
        tables: [{
            table: 'TADIR',
            where: [
                { field: 'PGMID', value: 'R3TR' },
                { field: 'OBJECT', value: 'CLAS' },
                { field: 'OBJ_NAME', value: '/UI2/CL_JSON' }
            ]
        }]
    },
    'system setting': {
        tables: [{
            table: 'TCURC',
            where: [{ field: 'WAERS', value: 'EUR' }]
        }]
    },
    's4hana 2020 fps02 to 2023 fps03': {
        components: {
            S4CORE: [
                { release: '105', sp: '>=2' },
                { release: '>=106 <=107' },
                { release: '108', sp: '<=3' }
            ]
        }
    },
    'google sdk': {
        components: {
            SAP_UI: [
                { release: '750', sp: '>=16' },
                { release: '752', sp: '>=9' },
                { release: '753', sp: '>=6' },
                { release: '754', sp: '>=2' },
                { release: '>=755' }
            ]
        },
        tables: [{
            table: 'SEOCOMPODF',
            where: [
                { field: 'CLSNAME', value: '/UI2/CL_JSON' },
                { field: 'CMPNAME', value: 'VERSION' },
                { field: 'VERSION', value: '1' },
                { field: 'ATTVALUE', op: 'GE', value: '12' }
            ]
        }]
    },
    'google sdk with ui_700': {
        anyOf: [
            { components: { UI_700: { release: '200', sp: '>=16' } } },
            {
                components: {
                    SAP_UI: [
                        { release: '750', sp: '>=16' },
                        { release: '752', sp: '>=9' },
                        { release: '753', sp: '>=6' },
                        { release: '754', sp: '>=2' },
                        { release: '>=755' }
                    ]
                }
            }
        ],
        tables: [{
            table: 'SEOCOMPODF',
            where: [
                { field: 'CLSNAME', value: '/UI2/CL_JSON' },
                { field: 'CMPNAME', value: 'VERSION' },
                { field: 'VERSION', value: '1' },
                { field: 'ATTVALUE', op: 'GE', value: '12' }
            ]
        }]
    },
    'nested anyOf': {
        anyOf: [
            { components: { S4CORE: true }, products: { 'SAP S/4HANA FOUNDATION': { version: '>=2021' } } },
            { components: { S4CORE: false, SAP_APPL: { release: '618', sp: '>=10' } } }
        ]
    }
};

describe('validateEngines', () => {
    test.each(Object.keys(GUIDE_EXAMPLES))('guide example "%s" is valid (strict)', (name) => {
        expect(validateEngines(GUIDE_EXAMPLES[name], { strict: true })).toEqual([]);
    });

    test('rejects non object engines', () => {
        expect(validateEngines([])).toHaveLength(1);
        expect(validateEngines('SAP_BASIS')).toHaveLength(1);
        expect(validateEngines(null)).toHaveLength(1);
    });

    test('unknown keys are errors only in strict mode', () => {
        const engines = { component: { SAP_BASIS: true }, components: { SAP_BASIS: { release: '>=750', patch: '1' } } };
        expect(validateEngines(engines)).toEqual([]);
        expect(validateEngines(engines, { strict: true })).toEqual([
            'engines.component: unknown engine check.',
            'engines.components.SAP_BASIS: unknown property "patch".'
        ]);
    });

    test('rejects invalid ranges and names', () => {
        expect(validateEngines({ components: { SAP_BASIS: { release: 750 } } })).toEqual(['engines.components.SAP_BASIS.release: invalid range "750".']);
        expect(validateEngines({ components: { SAP_BASIS: { sp: '>=SP5' } } })).toHaveLength(1);
        expect(validateEngines({ components: { "SAP'BASIS": true } })).toHaveLength(1);
        expect(validateEngines({ components: { SAP_UI: [] } })).toHaveLength(1);
        expect(validateEngines({ products: { 'ABAP PLATFORM': { version: '>=2022 FPS01' } } })).toHaveLength(1);
        expect(validateEngines({ notes: { 'abc': true } })).toHaveLength(1);
        expect(validateEngines({ notes: { '0': true } })).toHaveLength(1);
        expect(validateEngines({ notes: { '123': false } })).toHaveLength(1);
    });

    test('describes the accepted value kinds of each check', () => {
        expect(validateEngines({ notes: { '123': false } })).toEqual(['engines.notes.123: expected true or an object.']);
        expect(validateEngines({ notes: { '123': [{ version: '>=1' }] } })).toEqual(['engines.notes.123: expected true or an object.']);
        expect(validateEngines({ components: { SAP_BASIS: 'x' } })).toEqual(['engines.components.SAP_BASIS: expected true, false, an object or an array of objects.']);
        expect(validateEngines({ products: { 'S4HANA': [true] } })).toEqual(['engines.products.S4HANA[0]: expected an object.']);
    });

    test('rejects keys that collapse after normalization', () => {
        expect(validateEngines({ components: { sap_basis: true, SAP_BASIS: { release: '>=750' } } })).toEqual(['engines.components: "SAP_BASIS" duplicates "sap_basis".']);
        expect(validateEngines({ products: { 'ABAP PLATFORM': true, 'abap  platform ': true } })).toEqual(['engines.products: "abap  platform " duplicates "ABAP PLATFORM".']);
        expect(validateEngines({ notes: { '1234': true, '0001234': { version: '>=2' } } })).toEqual(['engines.notes: "0001234" duplicates "1234".']);
        expect(validateEngines({ anyOf: [{ notes: { '1234': true } }, { notes: { '0001234': true } }] })).toEqual([]);
    });

    test('normalization keeps unknown table properties', () => {
        expect(normalizeEngines({ tables: [{ table: 'tadir', mandt: '100', where: [{ field: 'pgmid', value: 'R3TR', client: '100' }] }] } as any)).toEqual({
            tables: [{ table: 'TADIR', mandt: '100', where: [{ field: 'PGMID', op: 'EQ', value: 'R3TR', client: '100' }] }]
        });
    });

    test('rejects unsafe or malformed table checks', () => {
        expect(validateEngines({ tables: {} })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR' }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR', where: [] }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR; DROP', where: [{ field: 'PGMID', value: 'R3TR' }] }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR', where: [{ field: "PGMID'", value: 'R3TR' }] }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR', where: [{ field: 'PGMID', op: 'IN', value: 'R3TR' }] }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR', where: [{ field: 'PGMID', value: "X' OR 'A' EQ 'A" }] }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR', where: [{ field: 'PGMID', value: 'A'.repeat(33) }] }] })).toHaveLength(1);
        expect(validateEngines({ tables: [{ table: 'TADIR', where: [{ field: 'PGMID', value: { a: 1 } }] }] })).toHaveLength(1);
    });

    test('limits anyOf depth and emptiness', () => {
        expect(validateEngines({ anyOf: [] })).toHaveLength(1);
        expect(validateEngines({ anyOf: [{ anyOf: [{ anyOf: [{ components: { SAP_BASIS: true } }] }] }] })).toEqual([]);
        expect(validateEngines({ anyOf: [{ anyOf: [{ anyOf: [{ anyOf: [{ components: { SAP_BASIS: true } }] }] }] }] })).toHaveLength(1);
    });

    test('normalizeEngines', () => {
        expect(normalizeEngines({
            components: { ' sap_basis ': { release: '>=75i' } },
            products: { 'abap   platform': true },
            notes: { '0003284711': true },
            tables: [{ table: 'tadir', where: [{ field: 'pgmid', value: 'R3TR' }] }],
            anyOf: [{ components: { st_pi: false } }]
        } as any)).toEqual({
            components: { SAP_BASIS: { release: '>=75I' } },
            products: { 'ABAP PLATFORM': true },
            notes: { '3284711': true },
            tables: [{ table: 'TADIR', where: [{ field: 'PGMID', op: 'EQ', value: 'R3TR' }] }],
            anyOf: [{ components: { ST_PI: false } }]
        });
    });
});
