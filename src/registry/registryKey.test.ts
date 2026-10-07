import { RegistryType } from "./RegistryType";
import { registryKey } from "./registryKey";

describe('registryKey', () => {
    const registry = (type: RegistryType, endpoint: string) => ({ getRegistryType: () => type, endpoint }) as any;

    test('public registry is stored as the reserved keyword', () => {
        expect(registryKey(registry(RegistryType.PUBLIC, 'https://www.trmregistry.com/registry'))).toBe('public');
    });

    test('local files are stored as the reserved keyword, never as their directory path', () => {
        expect(registryKey(registry(RegistryType.LOCAL, '/a/very/long/directory/path/that/would/not/fit/the/table/field/or/read_table/options'))).toBe('local');
    });

    test('private registries are stored by endpoint', () => {
        expect(registryKey(registry(RegistryType.PRIVATE, 'https://registry.example'))).toBe('https://registry.example');
    });
});
