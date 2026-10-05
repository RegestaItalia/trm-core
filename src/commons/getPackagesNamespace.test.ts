import { getPackagesNamespace } from './getPackagesNamespace';

describe('getPackagesNamespace', () => {
    test('returns the root reserved namespace', () => {
        expect(getPackagesNamespace('/ACME/ROOT', ['/ACME/SUB', 'ZSUB', 'YSUB'])).toBe('/ACME/');
    });

    test('returns the only reserved namespace used by a subpackage', () => {
        expect(getPackagesNamespace('ZROOT', ['YSUB', '/ACME/SUB'])).toBe('/ACME/');
    });

    test('returns the root customer namespace when no reserved namespace is used', () => {
        expect(getPackagesNamespace('ZROOT', ['YSUB'])).toBe('Z');
        expect(getPackagesNamespace('$ROOT', ['$SUB'])).toBe('$');
    });

    test('rejects more than one reserved namespace', () => {
        expect(() => getPackagesNamespace('/ACME/ROOT', ['/OTHER/SUB'])).toThrow('SAP packages must use at most one namespace, found: /ACME/, /OTHER/.');
        expect(() => getPackagesNamespace('ZROOT', ['/ACME/A', '/OTHER/B'])).toThrow('found: /ACME/, /OTHER/.');
    });
});
