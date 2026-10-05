import { AbstractRegistry, FileSystem, PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../../registry";

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
 * Registry key stored in the TRM install tables for a resolved install registry.
 */
export function installRegistryKey(registry: AbstractRegistry): string {
    return registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : registry.endpoint;
}
