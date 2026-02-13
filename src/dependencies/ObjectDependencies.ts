import { DEVCLASS, SOBJ_NAME, TROBJTYPE, ZTRM_OBJECT_DEPENDENCY } from "../client";
import { RegistryProvider } from "../registry";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";

export type DependenciesGenericTable = {
    tabname: string,
    tabkey: any[]
}

export class ObjectDependencies {

    public readonly tables: any = {};
    public trmPackages: {
        trmPackage: TrmPackage,
        dependencies: DependenciesGenericTable[]
    }[] = [];
    public sapPackages: {
        package: DEVCLASS,
        dependencies: DependenciesGenericTable[]
    }[] = [];


    constructor(public readonly object: TROBJTYPE, public readonly objName: SOBJ_NAME) { }

    public async setDependencies(dependencies: ZTRM_OBJECT_DEPENDENCY[]): Promise<ObjectDependencies> {
        for (const d of dependencies) {
            const tabkey = await this.addTableKey(d.tabname, d.tabkey);
            if (d.trmPackageName) {
                var trmPackage = (await SystemConnector.getInstalledPackages(true, false, true)).find(o => o.compareName(d.trmPackageName) && o.compareRegistry(RegistryProvider.getRegistry(d.trmPackageRegistry)));
                if (trmPackage) {
                    var iTrmPackage = this.trmPackages.findIndex(o => o.trmPackage.compareName(trmPackage.packageName) && o.trmPackage.compareRegistry(trmPackage.registry));
                    if (iTrmPackage < 0) {
                        iTrmPackage = this.trmPackages.push({
                            trmPackage,
                            dependencies: []
                        }) - 1;
                    }
                    var iTabKeys = this.trmPackages[iTrmPackage].dependencies.findIndex(o => o.tabname === d.tabname);
                    if (iTabKeys < 0) {
                        iTabKeys = this.trmPackages[iTrmPackage].dependencies.push({
                            tabname: d.tabname,
                            tabkey: []
                        }) - 1;
                    }
                    this.trmPackages[iTrmPackage].dependencies[iTabKeys].tabkey.push(tabkey);
                }
            } else if (d.devclass) {
                var iDevclass = this.sapPackages.findIndex(o => o.package === d.devclass);
                if (iDevclass < 0) {
                    iDevclass = this.sapPackages.push({
                        package: d.devclass,
                        dependencies: []
                    }) - 1;
                }
                var iTabKeys = this.sapPackages[iDevclass].dependencies.findIndex(o => o.tabname === d.tabname);
                if (iTabKeys < 0) {
                    iTabKeys = this.sapPackages[iDevclass].dependencies.push({
                        tabname: d.tabname,
                        tabkey: []
                    }) - 1;
                }
                this.sapPackages[iDevclass].dependencies[iTabKeys].tabkey.push(tabkey);
            }
        }
        return this;
    }

    private async addTableKey(table: string, key: string): Promise<any> {
        var offset = 0;
        var parsed: any = {};
        table = table.trim().toUpperCase();
        var definition = await SystemConnector.getTableKeys(table);
        definition = definition.sort((a, b) => Number(a.position) - Number(b.position));
        if (!this.tables[table]) {
            this.tables[table] = [];
        }
        definition.forEach(def => {
            const len = Number(def.leng);
            parsed[def.fieldname] = key.slice(offset, offset + len);
            offset += len;
        });
        this.tables[table].push(parsed);
        return parsed;
    }

}