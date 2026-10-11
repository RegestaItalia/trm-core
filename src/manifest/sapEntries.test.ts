import { getSapEntryConditions, validateSapEntries } from './sapEntries';
import { Manifest } from './Manifest';

describe('SAP entry conditions', () => {
    test('uppercases field names and escapes quotes', () => {
        expect(getSapEntryConditions({ ' name ': "O'NEIL", id: 12 })).toEqual(["NAME EQ 'O''NEIL'", "ID EQ '12'"]);
    });

    test('rejects empty entries, invalid fields and values', () => {
        expect(() => getSapEntryConditions({})).toThrow(/at least one field/);
        expect(() => getSapEntryConditions({ 'BAD FIELD': 'X' })).toThrow(/not a valid field name/);
        expect(() => getSapEntryConditions({ ID: { a: 1 } })).toThrow(/string or number/);
        expect(() => getSapEntryConditions({ ID: 'A AND B' })).toThrow(/AND/);
    });

    test('rejects a condition that does not fit one option line', () => {
        expect(getSapEntryConditions({ ID: 'X'.repeat(60) })).toEqual([`ID EQ '${'X'.repeat(60)}'`]);
        expect(() => getSapEntryConditions({ ID: 'X'.repeat(65) })).toThrow(/too long/);
        //escaped quotes count towards the limit
        expect(() => getSapEntryConditions({ ID: "'".repeat(33) })).toThrow(/too long/);
    });

    test('validateSapEntries reports invalid tables and entries', () => {
        expect(validateSapEntries({ ztab: [{ ID: 'A' }] })).toEqual([]);
        expect(validateSapEntries({ 'Z TAB': [{ ID: 'A' }], ZOTHER: [{ ID: 'A' }, {}], ZARR: {} })).toEqual([
            'sapEntries.Z TAB: invalid table name.',
            'sapEntries.ZOTHER[1]: SAP entry must be an object with at least one field.',
            'sapEntries.ZARR: expected an array.'
        ]);
    });

    test('Manifest.normalize rejects invalid SAP entries', () => {
        expect(() => Manifest.normalize({ name: 'test', version: '1.0.0', sapEntries: { ZTAB: [{}] } })).toThrow(/Invalid SAP entries declaration/);
        expect(Manifest.normalize({ name: 'test', version: '1.0.0', sapEntries: { ZTAB: [{ ID: "O'NEIL" }] } }).sapEntries).toEqual({ ZTAB: [{ ID: "O'NEIL" }] });
    });
});
