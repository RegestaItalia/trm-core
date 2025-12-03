import { DEVCLASS, PGMID, SOBJ_NAME, TROBJTYPE, ZTRM_OBJECT_DEPENDENCY } from "../client";
import { RegistryProvider } from "../registry";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";

export class ObjectDependencies {

    public readonly tables: any = {};
    public trmPackages: {
        trmPackage: TrmPackage,
        dependencies: {
            tabname: string,
            tabkey: any[]
        }[]
    }[] = [];
    public sapPackages: {
        package: DEVCLASS,
        dependencies: {
            tabname: string,
            tabkey: any[]
        }[]
    }[] = [];


    constructor(public readonly pgmid: PGMID, public readonly object: TROBJTYPE, public readonly objName: SOBJ_NAME) { }

    public async setDependencies(dependencies: ZTRM_OBJECT_DEPENDENCY[]): Promise<ObjectDependencies> {
        for(const d of dependencies){
            const tabkey = await this.addTableKey(d.tabname, d.tabkey);
            if(d.trmPackageName){
                var trmPackage = new TrmPackage(d.trmPackageName, RegistryProvider.getRegistry(d.trmPackageRegistry));
                var iTrmPackage = this.trmPackages.findIndex(o => o.trmPackage.compareName(trmPackage.packageName) && o.trmPackage.compareRegistry(trmPackage.registry));
                if(iTrmPackage < 0){
                    iTrmPackage = this.trmPackages.push({
                        trmPackage,
                        dependencies: []
                    }) - 1;
                }
                this.trmPackages[iTrmPackage].dependencies.push({
                    tabname: d.tabname,
                    tabkey
                });
            }else if(d.devclass){
                var iDevclass = this.sapPackages.findIndex(o => o.package === d.devclass);
                if(iDevclass < 0){
                    iDevclass = this.sapPackages.push({
                        package: d.devclass,
                        dependencies: []
                    }) - 1;
                }
                this.sapPackages[iDevclass].dependencies.push({
                    tabname: d.tabname,
                    tabkey
                });
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
        if(!this.tables[table]){
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