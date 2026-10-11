import { Logger } from "trm-commons";
import { LOCAL_RESERVED_KEYWORD, RegistryProvider, RegistryType } from "../registry";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { jsonStringifyWithKeyOrder } from "../commons";
import { createHash } from "crypto";
import { satisfies } from "semver";

export interface Lock {
    name: string,
    version: string,
    registry: string,
    integrity: string
}

export interface LockfileContent {
    lockfileVersion: number,
    source: string,
    /** Name of the locked (root) package. */
    name?: string,
    /** Version of the locked (root) package. */
    version?: string,
    /** Registry endpoint of the locked (root) package; not recorded for a package installed from a local file. */
    registry?: string,
    /** Integrity of the locked (root) release; not recorded when the source system has none. */
    integrity?: string,
    packages?: Lock[]
}

/** Release of the locked (root) package recorded in a lockfile. */
export interface RootLock {
    name: string,
    version: string,
    registry?: string,
    integrity?: string
}

export class Lockfile {

    private constructor(public lockfile: LockfileContent) { }

    public static async generate(root: TrmPackage, packages?: TrmPackage[]): Promise<Lockfile> {
        var lock: LockfileContent = {
            lockfileVersion: 1,
            source: SystemConnector.getDest(),
            packages: []
        };
        if (!packages) {
            packages = await SystemConnector.getInstalledPackages(true, true);
        }
        const rootManifest = root.manifest.get();
        var dependencies = rootManifest.dependencies || [];
        lock.name = rootManifest.name;
        lock.version = rootManifest.version;
        if (root.registry.getRegistryType() !== RegistryType.LOCAL) {
            lock.registry = root.registry.endpoint;
        }
        const rootIntegrity = await SystemConnector.getPackageIntegrity(root);
        if (rootIntegrity) {
            lock.integrity = rootIntegrity;
        } else {
            Logger.warning(`Integrity of package "${rootManifest.name}" is missing in system ${SystemConnector.getDest()}: clean installs won't verify its release. Reinstall it to restore its package data.`, { important: true });
        }
        for (const dep of dependencies) {
            if (dep.registry === LOCAL_RESERVED_KEYWORD) {
                throw new Error(`Cannot generate lockfile: dependency with local package "${dep.name}"`);
            } else {
                const depRegistry = RegistryProvider.getRegistry(dep.registry);
                if (root.compareName(dep.name) && root.compareRegistry(depRegistry)) {
                    throw new Error(`Package "${dep.name}" has declared invalid dependency with itself`);
                }
                if (!lock.packages.find(o => o.name === dep.name && o.registry === depRegistry.endpoint)) {
                    const depPackage = packages.find(o => o.compareName(dep.name) && o.compareRegistry(depRegistry));
                    if (depPackage) {
                        const depManifest = depPackage.manifest.get();
                        const depIntegrity = await SystemConnector.getPackageIntegrity(depPackage);
                        if (!depIntegrity) {
                            throw new Error(`Cannot generate lockfile: integrity of dependency "${dep.name}", registry "${depRegistry.endpoint}" is missing in system ${SystemConnector.getDest()}. Reinstall it to restore its package data.`);
                        }
                        lock.packages.push({
                            name: dep.name,
                            version: depManifest.version,
                            registry: depRegistry.endpoint,
                            integrity: depIntegrity
                        });
                        dependencies = dependencies.concat(depManifest.dependencies || []);
                    } else {
                        Logger.warning(`Dependency "${dep.name}", registry "${depRegistry.endpoint}" not found in system ${SystemConnector.getDest()}`, { important: true });
                    }
                }
            }
        }
        return new Lockfile(lock);
    }

    public static fromJson(json: any): Lockfile {
        if(json.lockfileVersion === 1){
            return new Lockfile(json);
        }
        throw new Error(`Unable to parse lockfile.`);
    }

    public toJson(): string {
        const KEYS_ORDER = [
            "lockfileVersion",
            "source",
            "name",
            "version",
            "registry",
            "integrity"
        ] satisfies readonly (keyof LockfileContent & string)[];
        return jsonStringifyWithKeyOrder(this.lockfile, KEYS_ORDER, 2);
    }

    /**
     * Returns the locked (root) release, or `undefined` when the lockfile doesn't record it.
     */
    public getRootLock(): RootLock | undefined {
        const { name, version, registry, integrity } = this.lockfile;
        if (!name || !version) {
            return undefined;
        }
        return { name, version, registry: registry || undefined, integrity: integrity || undefined };
    }

    /**
     * Returns the lock of `trmPackage`, or `undefined` when the lockfile has no entry for it
     * (a lockfile generated without the package installed on the source system).
     * @throws When the locked version does not satisfy `versionRange`.
     */
    public getLock(trmPackage: TrmPackage, versionRange: string): Lock | undefined {
        const lock = this.lockfile.packages?.find(o => trmPackage.compareName(o.name) && trmPackage.compareRegistry(RegistryProvider.getRegistry(o.registry)));
        if (!lock) {
            return undefined;
        }
        if (!satisfies(lock.version, versionRange, { includePrerelease: true })) {
            throw new Error(`Lock for package "${trmPackage.packageName}", registry "${trmPackage.registry.endpoint}" pins v${lock.version}, which does not satisfy ${versionRange}.`);
        }
        return lock;
    }

    public static async testReleaseByLock(lock: Lock): Promise<boolean> {
        if (!lock.integrity) {
            throw new Error(`Lock for package "${lock.name}", registry "${lock.registry}" has no integrity: regenerate the lockfile.`);
        }
        const registry = RegistryProvider.getRegistry(lock.registry);
        const ping = await registry.ping();
        const release = await registry.getPackage(lock.name, lock.version);
        const artifact = await registry.downloadArtifact(lock.name, lock.version);
        const checksum = createHash("sha512").update(artifact.binary).digest("base64");
        if (release.checksum !== lock.integrity || checksum !== lock.integrity) {
            Logger.error(`SECURITY ISSUE! Release "${lock.name}", registry "${lock.registry}", integrity in lockfile does NOT match!`, { important: true });
            Logger.error(`SECURITY ISSUE! Registry SHA is ${release.checksum}`, { important: true });
            Logger.error(`SECURITY ISSUE! Artifact SHA is ${checksum}`, { important: true });
            Logger.error(`SECURITY ISSUE! Lockfile SHA is ${lock.integrity}`, { important: true });
            Logger.error(`SECURITY ISSUE! Please, report the issue to ${ping && ping.alert_email ? ping.alert_email : 'registry moderation team'}`, { important: true });
            return false;
        }
        return true;
    }

}