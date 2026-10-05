import { Logger } from "trm-commons";
import { LOCAL_RESERVED_KEYWORD, RegistryProvider } from "../registry";
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
    name?: string,
    version?: string,
    packages?: Lock[]
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
                        Logger.warning(`Dependency "${dep.name}", registry "${depRegistry.endpoint}" not found in system ${SystemConnector.getDest()}`);
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
            "version"
        ] satisfies readonly (keyof LockfileContent & string)[];
        return jsonStringifyWithKeyOrder(this.lockfile, KEYS_ORDER, 2);
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
            Logger.error(`SECURITY ISSUE! Release "${lock.name}", registry "${lock.registry}", integrity in lockfile does NOT match!`);
            Logger.error(`SECURITY ISSUE! Registry SHA is ${release.checksum}`);
            Logger.error(`SECURITY ISSUE! Artifact SHA is ${checksum}`);
            Logger.error(`SECURITY ISSUE! Lockfile SHA is ${lock.integrity}`);
            Logger.error(`SECURITY ISSUE! Please, report the issue to ${ping && ping.alert_email ? ping.alert_email : 'registry moderation team'}`);
            return false;
        }
        return true;
    }

}