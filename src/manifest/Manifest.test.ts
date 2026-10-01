import { Manifest } from './Manifest';
import { TrmManifest } from './TrmManifest';

function manifest(extra: Partial<TrmManifest> = {}): TrmManifest {
    return {
        name: 'test-package',
        version: '1.0.0',
        ...extra
    };
}

const engines = {
    components: {
        'sap_basis': { release: '>= 750', sp: '>=5' },
        'S4CORE': false,
        'st-pi': true,
        'SAP_UI': [{ release: '750', sp: '>=17' }, { release: '>=752' }]
    },
    products: {
        'abap  platform': { version: '>=2022 <=2023' }
    },
    notes: {
        '0003284711': true,
        '1234567': { version: '>=3' }
    },
    tables: [{
        table: 'seocompodf',
        where: [
            { field: 'clsname', value: '/UI2/CL_JSON' },
            { field: 'ATTVALUE', op: 'GE', value: "12 & 'x' <y>" }
        ]
    }],
    anyOf: [
        { components: { 'UI_700': { release: '200', sp: '>=16' } } },
        { components: { 'SAP_UI': true } }
    ]
} as any;

describe('Manifest engines', () => {
    test('normalize uppercases names, strips note leading zeros and defaults operators', () => {
        const normalized = Manifest.normalize(manifest({ engines }));
        expect(normalized.engines).toEqual({
            components: {
                SAP_BASIS: { release: '>= 750', sp: '>=5' },
                S4CORE: false,
                'ST-PI': true,
                SAP_UI: [{ release: '750', sp: '>=17' }, { release: '>=752' }]
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
                    { field: 'ATTVALUE', op: 'GE', value: "12 & 'x' <y>" }
                ]
            }],
            anyOf: [
                { components: { UI_700: { release: '200', sp: '>=16' } } },
                { components: { SAP_UI: true } }
            ]
        });
    });

    test('normalize drops empty engines', () => {
        expect(Manifest.normalize(manifest({ engines: {} })).engines).toBeUndefined();
    });

    test('normalize throws on malformed known engines', () => {
        expect(() => Manifest.normalize(manifest({ engines: { components: { SAP_BASIS: { release: 'abc!' } } } }))).toThrow(/Invalid engines declaration/);
    });

    test('normalize keeps unknown engine checks (forward compatibility)', () => {
        const normalized = Manifest.normalize(manifest({ engines: { futureCheck: { x: 1 } } as any }));
        expect((normalized.engines as any).futureCheck).toEqual({ x: 1 });
    });

    test('getJSON places engines before sapEntries', () => {
        const json = new Manifest(manifest({ engines: { components: { SAP_BASIS: true } }, sapEntries: { TADIR: [{ OBJ_NAME: 'X' }] } })).getJSON();
        expect(json.indexOf('"engines"')).toBeGreaterThan(-1);
        expect(json.indexOf('"engines"')).toBeLessThan(json.indexOf('"sapEntries"'));
    });

    test('engines survive the ABAP XML round-trip', () => {
        const original = new Manifest(manifest({ engines }));
        const xml = original.getAbapXml();
        expect(xml).toContain('<ENGINES>');
        const parsed = Manifest.fromAbapXml(xml);
        expect(parsed.get().engines).toEqual(original.get().engines);
    });
});
