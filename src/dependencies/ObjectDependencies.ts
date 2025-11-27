import { DEVCLASS, PGMID, SOBJ_NAME, TROBJTYPE, ZTRM_OBJECT_DEPENDENCY } from "../client";
import { RegistryProvider } from "../registry";
import { TrmPackage } from "../trmPackage";

export class ObjectDependencies {

    public readonly tables: {
        tadir?: {
            pgmid: string,
            object: string,
            obj_name: string
        }[],
        tfdir?: {
            funcname: string
        }[]
    } = {};
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


    constructor(public readonly pgmid: PGMID, public readonly object: TROBJTYPE, public readonly objName: SOBJ_NAME, dependencies: ZTRM_OBJECT_DEPENDENCY[]) {
        dependencies.forEach(d => {
            var tabkey: any;
            switch (d.tabname) {
                case 'TADIR':
                    tabkey = this.addTadir(d.tabkey);
                    break;
                case 'TFDIR':
                    tabkey = this.addTfdir(d.tabkey);
                    break;
                default:
                    throw new Error(`Unhandled dependency with "${d.tabname}"`);
            }
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
        });
    }

    private addTadir(key: string): any {
        var tabkey: any;
        const [pgmid, object, obj_name] = [key.slice(0, 4), key.slice(4, 8), key.slice(8, 48)];
        if(!this.tables.tadir){
            this.tables.tadir = [];
        }
        tabkey = {
            pgmid,
            object,
            obj_name
        };
        this.tables.tadir.push(tabkey);
        return tabkey;
    }

    private addTfdir(key: string): any {
        var tabkey: any;
        const [funcname] = [key.slice(0, 30)];
        if(!this.tables.tfdir){
            this.tables.tfdir = [];
        }
        tabkey = {
            funcname
        };
        this.tables.tfdir.push(tabkey);
        return tabkey;
    }
}