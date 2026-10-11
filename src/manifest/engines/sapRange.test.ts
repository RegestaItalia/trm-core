import { compareSapValues, normalizeSapValue, parseSupportPackage, satisfiesSapRange, validSapRange } from './sapRange';

describe('sapRange', () => {
    test('validates ranges per mode', () => {
        expect(validSapRange('>=750', 'release')).toBe(true);
        expect(validSapRange('>= 750 <=758', 'release')).toBe(true);
        expect(validSapRange('75I', 'release')).toBe(true);
        expect(validSapRange('750 || >=752', 'release')).toBe(true);
        expect(validSapRange('>=7.52', 'version')).toBe(true);
        expect(validSapRange('>=16', 'number')).toBe(true);
        expect(validSapRange('', 'release')).toBe(false);
        expect(validSapRange('>=750 ||', 'release')).toBe(false);
        expect(validSapRange('>=75I', 'number')).toBe(false);
        expect(validSapRange('>=7.5x', 'version')).toBe(false);
        expect(validSapRange("750' OR '1", 'release')).toBe(false);
        expect(validSapRange('~750', 'release')).toBe(false);
        expect(validSapRange(12 as any, 'number')).toBe(false);
    });

    test('compares releases numerically or character-wise', () => {
        expect(compareSapValues('758', '750', 'release')).toBeGreaterThan(0);
        expect(compareSapValues('2020', '758', 'release')).toBeGreaterThan(0);
        expect(compareSapValues('75I', '75H', 'release')).toBeGreaterThan(0);
        expect(compareSapValues('75I', '758', 'release')).toBeGreaterThan(0);
        expect(compareSapValues('DEV', '758', 'release')).toBeGreaterThan(0);
        expect(compareSapValues('DEV', '2020', 'release')).toBeUndefined();
    });

    test('compares dotted versions', () => {
        expect(compareSapValues('7.52', '2022', 'version')).toBeLessThan(0);
        expect(compareSapValues('7.52', '7.5', 'version')).toBeGreaterThan(0);
        expect(compareSapValues('2.0', '2', 'version')).toBe(0);
    });

    test('normalizes support package levels', () => {
        expect(normalizeSapValue('0000000002', 'number')).toBe('2');
        expect(normalizeSapValue('0002', 'number')).toBe('2');
        expect(normalizeSapValue('X', 'number')).toBeUndefined();
    });

    test('satisfies AND and OR ranges', () => {
        expect(satisfiesSapRange('758', '>=750 <=758', 'release')).toBe(true);
        expect(satisfiesSapRange('740', '>=750 <=758', 'release')).toBe(false);
        expect(satisfiesSapRange('740', '740 || >=752', 'release')).toBe(true);
        expect(satisfiesSapRange('750', '740 || >=752', 'release')).toBe(false);
        expect(satisfiesSapRange('0000000017', '>=16', 'number')).toBe(true);
        expect(satisfiesSapRange('2023', '>=2022 <=2023', 'version')).toBe(true);
        expect(satisfiesSapRange('DEV', '>=2020', 'release')).toBe(false);
        expect(satisfiesSapRange('75i', '75I', 'release')).toBe(true);
    });

    test('parses support package names', () => {
        expect(parseSupportPackage('SAPK-75017INSAPUI')).toEqual({ release: '750', sp: 17, component: 'SAPUI' });
        expect(parseSupportPackage('SAPK-20016INUI700')).toEqual({ release: '200', sp: 16, component: 'UI700' });
        expect(parseSupportPackage('SAPKB75017')).toEqual({ release: '750', sp: 17, component: undefined });
        expect(parseSupportPackage('NOT-A-SP')).toBeUndefined();
    });
});
