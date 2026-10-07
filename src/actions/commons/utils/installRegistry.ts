import { AbstractRegistry, FileSystem, RegistryType, registryKey } from "../../../registry";

/**
 * Returns the package an install is recorded under: a local (.trm) artifact is recorded under the
 * registry it was published to and the name in its manifest, not under the file directory.
 */
export async function resolveInstallPackage(registry: AbstractRegistry, name: string): Promise<{ registry: AbstractRegistry, name: string }> {
    if (registry.getRegistryType() !== RegistryType.LOCAL) {
        return { registry, name };
    }
    const realPackage = await (registry as FileSystem).getRealPackage();
    return { registry: realPackage.registry, name: realPackage.packageName };
}

/**
 * Returns the registry an install is recorded under: the registry a local (.trm) artifact was
 * published to, otherwise the registry itself.
 */
export async function resolveInstallRegistry(registry: AbstractRegistry): Promise<AbstractRegistry> {
    if (registry.getRegistryType() !== RegistryType.LOCAL) {
        return registry;
    }
    return (registry as FileSystem).getRealRegistry();
}

/**
 * Registry key stored in the TRM install tables for a resolved install registry.
 */
export function installRegistryKey(registry: AbstractRegistry): string {
    return registryKey(registry);
}
