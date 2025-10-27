import { Logger } from "trm-commons";
import { LOCAL_RESERVED_KEYWORD, RegistryProvider } from "../registry";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { Lockfile } from "./Lockfile";
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
                const depRegistry = RegistryProvider.getRegistry(dep.registry);
                if(root.compareName(dep.name) && root.compareRegistry(depRegistry)){
                    throw new Error(`Package "${dep.name}" has declared invalid dependency with itself`);
                }
                if (!lock.packages.find(o => o.name === dep.name && o.registry === depRegistry.endpoint)) {
                    const depPackage = packages.find(o => o.compareName(dep.name) && o.compareRegistry(depRegistry));
                    if (depPackage) {
                        const depManifest = depPackage.manifest.get();
                        const depIntegrity = await SystemConnector.getPackageIntegrity(depPackage);
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
        return new Lock(lock);
    }

    public toJson(): string {
        const KEYS_ORDER = [
            "lockfileVersion",
            "name",
            "version"
        ] satisfies readonly (keyof Lockfile & string)[];
        return jsonStringifyWithKeyOrder(this.lockfile, KEYS_ORDER, 2);
    }

}