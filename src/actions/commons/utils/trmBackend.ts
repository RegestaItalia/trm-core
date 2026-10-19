import { lt, valid } from "semver";
import { Logger } from "trm-commons";
import { AbstractRegistry, RegistryType } from "../../../registry";
import { SystemConnector, TRM_REST_PACKAGE_NAME, TRM_SERVER_PACKAGE_NAME } from "../../../systemConnector";
import { TrmPackage } from "../../../trmPackage";

/**
 * Backend APIs this trm-core relies on, by generation: the first trm-server and trm-rest releases with them.
 *
 * Any action needs the backend this trm-core is built for: a missing API is an error. Only a trm-server/trm-rest
 * upgrade runs on an older backend (see {@link getMissingTrmBackendApis}), so an action that calls a newer API
 * during that upgrade checks {@link lacksTrmBackendApis} and continues without it.
 */
export const TRM_BACKEND_APIS = {
    /** Action locks, batch import, install transports, test imports, transport object locks. */
    trmServer7: { server: '7.0.0', rest: '6.0.0' },
    /** Transport layers routed to a landscape target. */
    trmServer8: { server: '8.0.0', rest: '7.0.0' }
} as const;

export type TrmBackendApis = keyof typeof TRM_BACKEND_APIS;

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
 * Backend API generations ({@link TRM_BACKEND_APIS}) the installed trm-server or trm-rest predates.
 * Such a backend can only upgrade itself: the newer APIs exist only once the upgrade is imported.
 */
export async function getMissingTrmBackendApis(): Promise<TrmBackendApis[]> {
    const isOlder = (version: string | undefined, apiVersion: string) => !!version && (!valid(version) || lt(version, apiVersion));
    const serverVersion = await installedVersion(() => SystemConnector.getTrmServerPackage());
    const restVersion = await installedVersion(() => SystemConnector.getTrmRestPackage());
    const missing = (Object.keys(TRM_BACKEND_APIS) as TrmBackendApis[]).filter(apis =>
        isOlder(serverVersion, TRM_BACKEND_APIS[apis].server) || isOlder(restVersion, TRM_BACKEND_APIS[apis].rest));
    Logger.log(`TRM backend: trm-server ${serverVersion || '-'}, trm-rest ${restVersion || '-'}${missing.length > 0 ? ` (missing APIs: ${missing.join(', ')})` : ''}`, true);
    return missing;
}

/** Whether the backend of a trm-server/trm-rest upgrade lacks the `apis` generation: see {@link TRM_BACKEND_APIS}. */
export function lacksTrmBackendApis(context: { missingBackendApis?: TrmBackendApis[] }, apis: TrmBackendApis): boolean {
    return !!context.missingBackendApis?.includes(apis);
}
