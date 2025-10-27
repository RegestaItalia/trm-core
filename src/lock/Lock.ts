import { Logger } from "trm-commons";
import { LOCAL_RESERVED_KEYWORD, RegistryProvider } from "../registry";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { Lockfile } from "./Lockfile";
import { writeFileSync } from "fs";
import { jsonStringifyWithKeyOrder } from "../commons";

export class Lock {

    private constructor(public lockfile: Lockfile) { }

    public static async generate(root: TrmPackage, packages?: TrmPackage[]): Promise<Lock> {
        var lock: Lockfile = {
            lockfileVersion: 1,
            packages: []
        };
        if (!packages) {
            packages = await SystemConnector.getInstalledPackages(true, true, true);
        }
        const rootManifest = root.manifest.get();
        var dependencies = rootManifest.dependencies || [];
        lock.name = rootManifest.name;
        lock.version = rootManifest.version;
        for (const dep of dependencies) {
            if (dep.registry === LOCAL_RESERVED_KEYWORD) {
                throw new Error(`Cannot generate lockfile: dependency with local package "${dep.name}"`);
            } else {
                const registryResolved = RegistryProvider.getRegistry(dep.registry).endpoint; //resolve to actual endpoint
                if (!lock.packages.find(o => o.name === dep.name && o.registry === registryResolved)) {
                    const depRegistry = RegistryProvider.getRegistry(dep.registry);
                    const depPackage = packages.find(o => o.compareName(dep.name) && o.compareRegistry(depRegistry));
                    if (depPackage) {
                        const depManifest = depPackage.manifest.get();
                        const depIntegrity = await SystemConnector.getPackageIntegrity(depPackage);
                        lock.packages.push({
                            name: dep.name,
                            version: depManifest.version,
                            registry: registryResolved,
                            integrity: depIntegrity
                        });
                        dependencies = dependencies.concat(depManifest.dependencies || []);
                    } else {
                        Logger.warning(`Dependency "${dep.name}", registry "${registryResolved}" not found in system ${SystemConnector.getDest()}`);
                    }
                }
            }
        }
        return new Lock(lock);
    }

    public toFile(path: string): void {
        const KEYS_ORDER = [
            "lockfileVersion",
            "name",
            "version"
        ] satisfies readonly (keyof Lockfile & string)[];
        const json = jsonStringifyWithKeyOrder(this.lockfile, KEYS_ORDER, 2);
        writeFileSync(path, json);
    }

}