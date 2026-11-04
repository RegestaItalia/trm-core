import type { AbstractRegistry } from "../registry";
import { registryKey } from "../registry/registryKey";

/** Registry of a package in the action log, as in the TRM package data. The action log never fails an action. */
export function logRegistry(registry: AbstractRegistry | undefined): string | undefined {
    try {
        return registry ? registryKey(registry) : undefined;
    } catch {
        return registry?.endpoint;
    }
}
