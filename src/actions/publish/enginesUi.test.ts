import { enginesToUiRows, uiRowsToEngines, validateEnginesUiSection } from './enginesUi';

const engines = {
    trm: {
        'trm-core': '>=9.4.0',
        'trm-server': '^6.4.1'
    },
    components: {
        SAP_BASIS: { release: '>=750', sp: '>=5' },
        SAP_GWFND: true,
        S4CORE: false,
        SAP_UI: [{ release: '750', sp: '>=17' }, { release: '>=752' }]
    },
    products: {
        'ABAP PLATFORM': { version: '>=2022 <=2023' },
        SLT: false
    },
    notes: {
        '3284711': true,
        '1234567': { version: '>=3' }
    },
    tables: [{
        table: 'SEOCOMPODF',
        where: [
            { field: 'CLSNAME', value: '/UI2/CL_JSON' },
            { field: 'ATTVALUE', op: 'GE', value: '12' }
        ]
    }],
    anyOf: [
        { components: { UI_700: { release: '200', sp: '>=16' } } },
        { components: { SAP_UI: { release: '>=750' } } }
    ]
} as any;

describe('engines UI rows', () => {
    test('rows round-trip to the same engines', () => {
        expect(uiRowsToEngines(enginesToUiRows(engines))).toEqual(engines);
    });

    test('value shapes are mapped to rows', () => {
        const rows = enginesToUiRows(engines);
        expect(rows.components).toEqual([
            { name: 'SAP_BASIS', notInstalled: false, constraints: [{ release: '>=750', sp: '>=5' }] },
            { name: 'SAP_GWFND', notInstalled: false, constraints: [] },
            { name: 'S4CORE', notInstalled: true },
            { name: 'SAP_UI', notInstalled: false, constraints: [{ release: '750', sp: '>=17' }, { release: '>=752' }] }
        ]);
        expect(rows.trm).toEqual([{ name: 'trm-core', version: '>=9.4.0' }, { name: 'trm-server', version: '^6.4.1' }]);
        expect(rows.notes).toEqual([{ note: '1234567', version: '>=3' }, { note: '3284711' }]);
        expect(rows.tables[0].where).toEqual([{ field: 'CLSNAME', value: '/UI2/CL_JSON' }, { field: 'ATTVALUE', op: 'GE', value: '12' }]);
    });

    test('empty sections are omitted', () => {
        expect(uiRowsToEngines(enginesToUiRows(undefined))).toEqual({});
        expect(uiRowsToEngines({ ...enginesToUiRows(engines), products: [], anyOf: [] })).not.toHaveProperty('products');
    });

    test('unknown checks are kept untouched', () => {
        const rows = enginesToUiRows({ components: { SAP_BASIS: true }, futureCheck: { x: 1 } } as any);
        expect(rows.other).toEqual({ futureCheck: { x: 1 } });
        expect(uiRowsToEngines(rows)).toEqual({ components: { SAP_BASIS: true }, futureCheck: { x: 1 } });
    });
});

describe('engines UI section validation', () => {
    test('valid sections', () => {
        const rows = enginesToUiRows(engines);
        (['trm', 'components', 'products', 'notes', 'tables'] as const).forEach(section => {
            expect(validateEnginesUiSection(section, rows[section])).toBe(true);
            expect(validateEnginesUiSection(section, [])).toBe(true);
        });
    });

    test('duplicate names are rejected', () => {
        expect(validateEnginesUiSection('components', [{ name: 'SAP_BASIS' }, { name: 'sap_basis' }])).toBe('Duplicate component "sap_basis"');
        expect(validateEnginesUiSection('products', [{ name: 'ABAP PLATFORM' }, { name: 'ABAP  PLATFORM' }])).toBe('Duplicate product "ABAP  PLATFORM"');
        expect(validateEnginesUiSection('notes', [{ note: '3284711' }, { note: '0003284711' }])).toBe('Duplicate SAP Note "0003284711"');
        expect(validateEnginesUiSection('trm', [{ name: 'trm-core', version: '>=1.0.0' }, { name: 'trm-core', version: '>=2.0.0' }])).toBe('Duplicate TRM package "trm-core"');
    });

    test('invalid values are rejected', () => {
        expect(validateEnginesUiSection('components', [{ name: 'SAP_BASIS', constraints: [{ release: '^750' }] }])).not.toBe(true);
        expect(validateEnginesUiSection('notes', [{ note: 'abc' }])).not.toBe(true);
        expect(validateEnginesUiSection('trm', [{ name: 'trm-client', version: '>=1.0.0' }])).not.toBe(true);
        expect(validateEnginesUiSection('trm', [{ name: 'trm-core', version: 'abc!' }])).not.toBe(true);
        expect(validateEnginesUiSection('tables', [{ table: 'TADIR', where: [] }])).not.toBe(true);
        expect(validateEnginesUiSection('tables', [{ table: 'TADIR', where: [{ field: 'OBJ_NAME', op: 'IN', value: 'X' }] }])).not.toBe(true);
    });
});
