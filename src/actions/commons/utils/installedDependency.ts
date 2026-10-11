import { satisfies, valid } from "semver";
import type { DependencyCheckStatus } from "../../checkPackageDependencies";
import { TrmPackage } from "../../../trmPackage";

/** State of a dependency on the target system, compared with the range it is required in. */
export type InstalledDependency = {
    status: DependencyCheckStatus,
    /** Version on the system; set for `ok` and `versionMismatch`. */
    installedVersion?: string,
    /** Why the installed manifest could not be read; set only for `manifestUnreadable`. */
    error?: unknown
}

/**
 * Finds `trmPackage` in the system package snapshot and checks the installed version against
 * `versionRange`. Installed prereleases are matched with `includePrerelease`.
 */
export function getInstalledDependency(systemPackages: TrmPackage[], trmPackage: TrmPackage, versionRange: string): InstalledDependency {
    const installed = (systemPackages || []).find(o => TrmPackage.compare(o, trmPackage));
    if (!installed) {
        return { status: 'notFound' };
    }
    let installedVersion: string;
    try {
        installedVersion = installed.manifest?.get().version;
    } catch (error) {
        return { status: 'manifestUnreadable', error };
    }
    if (typeof installedVersion !== 'string' || valid(installedVersion) === null) {
        return { status: 'manifestUnreadable' };
    }
    return {
        status: satisfies(installedVersion, versionRange, { includePrerelease: true }) ? 'ok' : 'versionMismatch',
        installedVersion
    };
}
