import { lt, valid } from "semver";
import { Logger } from "trm-commons";
import { AbstractRegistry, RegistryType } from "../../../registry";
import { SystemConnector, TRM_REST_PACKAGE_NAME, TRM_SERVER_PACKAGE_NAME } from "../../../systemConnector";
import { TrmPackage } from "../../../trmPackage";

/**
 * First trm-server and trm-rest releases with the backend APIs this trm-core relies on
 * (action locks, batch import, install transports, test imports, transport object locks).
 */
export const TRM_SERVER_API_VERSION = '7.0.0';
export const TRM_REST_API_VERSION = '6.0.0';

/**
 * Permanent TADIR transport of the public trm-server and trm-rest: the same request in every release.
 * The registry doesn't deliver it through its transport download: it's read from the release artifact.
 */
export const TRM_FIXED_TADIR_TRANSPORTS: Readonly<Record<string, string>> = {
    'trm-server': 'TRMK900000',
    'trm-rest': 'TRMK900001'
};

/** Whether a package is the public trm-server or trm-rest: the TRM backend itself. */
export function isTrmBackendPackage(registry: AbstractRegistry, name: string): boolean {
    return registry.getRegistryType() === RegistryType.PUBLIC
        && [TRM_SERVER_PACKAGE_NAME, TRM_REST_PACKAGE_NAME].includes(name.trim().toLowerCase());
}

async function installedVersion(read: () => Promise<TrmPackage>): Promise<string | undefined> {
    try {
        return (await read()).manifest?.get().version;
    } catch {
        // not installed
        return undefined;
    }
}

/**
 * Whether the connected TRM backend predates {@link TRM_SERVER_API_VERSION} / {@link TRM_REST_API_VERSION}.
 * Such a backend can only upgrade itself, with the APIs of its own generation: the newer APIs exist
 * only once the upgrade is imported.
 */
export async function isLegacyTrmBackend(): Promise<boolean> {
    const isLegacy = (version: string | undefined, apiVersion: string) => !!version && (!valid(version) || lt(version, apiVersion));
    const serverVersion = await installedVersion(() => SystemConnector.getTrmServerPackage());
    const restVersion = await installedVersion(() => SystemConnector.getTrmRestPackage());
    const legacy = isLegacy(serverVersion, TRM_SERVER_API_VERSION) || isLegacy(restVersion, TRM_REST_API_VERSION);
    Logger.log(`TRM backend: trm-server ${serverVersion || '-'}, trm-rest ${restVersion || '-'}${legacy ? ' (legacy APIs)' : ''}`, true);
    return legacy;
}
