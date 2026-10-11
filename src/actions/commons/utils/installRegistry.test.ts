import { PUBLIC_RESERVED_KEYWORD, RegistryType } from '../../../registry';
import { installRegistryKey, resolveInstallPackage } from './installRegistry';

describe('install registry', () => {
    const publicRegistry = { getRegistryType: () => RegistryType.PUBLIC, endpoint: 'https://public.example' } as any;
    const privateRegistry = { getRegistryType: () => RegistryType.PRIVATE, endpoint: 'https://private.example' } as any;

    test('remote registries are used as they are', async () => {
        await expect(resolveInstallPackage(privateRegistry, 'pkg')).resolves.toEqual({ registry: privateRegistry, name: 'pkg' });
    });

    test('a local artifact resolves to the registry and name in its manifest', async () => {
        const local = {
            getRegistryType: () => RegistryType.LOCAL,
            endpoint: '/tmp/artifacts',
            getRealPackage: jest.fn().mockResolvedValue({ packageName: 'real-pkg', registry: privateRegistry })
        } as any;
        await expect(resolveInstallPackage(local, 'pkg-1.0.0.trm')).resolves.toEqual({ registry: privateRegistry, name: 'real-pkg' });
    });

    test('stored key is the public keyword or the registry endpoint', () => {
        expect(installRegistryKey(publicRegistry)).toBe(PUBLIC_RESERVED_KEYWORD);
        expect(installRegistryKey(privateRegistry)).toBe('https://private.example');
    });
});
