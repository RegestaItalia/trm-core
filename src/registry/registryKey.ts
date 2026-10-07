import { AbstractRegistry } from "./AbstractRegistry";
import { LOCAL_RESERVED_KEYWORD } from "./FileSystem";
import { RegistryType } from "./RegistryType";
import { PUBLIC_RESERVED_KEYWORD } from "./RegistryV2";

/**
 * Registry value stored in the TRM package tables: the reserved keywords for the public registry and
 * local (.trm) files, the endpoint for any other registry. A file path is never stored: it exceeds
 * the table field and the read_table option length.
 */
export function registryKey(registry: AbstractRegistry): string {
    switch (registry.getRegistryType()) {
        case RegistryType.PUBLIC:
            return PUBLIC_RESERVED_KEYWORD;
        case RegistryType.LOCAL:
            return LOCAL_RESERVED_KEYWORD;
        default:
            return registry.endpoint;
    }
}
