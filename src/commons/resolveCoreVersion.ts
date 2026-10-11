import { getNodePackage } from "./getNodePackage";

/**
 * Returns the version of trm-core in use.
 *
 * Clients may resolve trm-core from a different location (e.g. their global node modules), so a version
 * they supply takes precedence over the package.json found by this package.
 *
 * @param coreVersion version supplied by the client
 * @returns the version, or `undefined` when it can't be determined
 */
export function resolveCoreVersion(coreVersion?: string): string | undefined {
    if (coreVersion) {
        return coreVersion;
    }
    try {
        return getNodePackage().version;
    } catch {
        return undefined;
    }
}
