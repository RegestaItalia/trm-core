import { deletionDescription, trmTransportDescription } from "./TransportDescription";

describe('TRM transport descriptions', () => {
    test('are built from kind, package and version', () => {
        expect(trmTransportDescription('pkg', '1.0.0')).toBe('@X1@TRM pkg 1.0.0');
        expect(trmTransportDescription('pkg', 'v1.0.0', 'D')).toBe('@X1@TRM (D) pkg v1.0.0');
        expect(trmTransportDescription('p'.repeat(80), '1.0.0', 'BKP')).toHaveLength(60);
    });

    // Same cases as the registry (transport surgeon test_delivery_worker deletion_description).
    test.each([
        ['@X1@TRM (BKP) trm-server 6.4.1', '@X1@TRM (DELE) trm-server 6.4.1'],
        ['@X1@TRM (DELE) pkg 1.0.0', '@X1@TRM (DELE) pkg 1.0.0'],
        ['@X1@TRM pkg 1.0.0', '@X1@TRM (DELE) pkg 1.0.0'],
        ['@X1@TRM (BKP) pkg 1.0.0   ', '@X1@TRM (DELE) pkg 1.0.0'],
        [`@X1@TRM (BKP) ${'p'.repeat(46)}`, `@X1@TRM (DELE) ${'p'.repeat(45)}`],
        ['Customer request', 'Customer request']
    ])('deleting "%s" is "%s"', (source, expected) => {
        expect(deletionDescription(source)).toBe(expected);
    });
});
