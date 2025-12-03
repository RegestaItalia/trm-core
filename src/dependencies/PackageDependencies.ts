import { DEVCLASS, ZTRM_OBJECT_DEPENDENCIES } from "../client";
import { ObjectDependencies } from "./ObjectDependencies";

export class PackageDependencies {

    public readonly dependencies: ObjectDependencies[] = [];

    constructor(public readonly devclass: DEVCLASS) {}
    
    public async setDependencies(packageDependencies: ZTRM_OBJECT_DEPENDENCIES[]): Promise<PackageDependencies> {
        for(const d of packageDependencies){
            this.dependencies.push(await (new ObjectDependencies(d.pgmid, d.object, d.objName).setDependencies(d.dependencies || [])));
        }
        return this;
    }

    public getAllTables(): any {
        var all = {};
        this.dependencies.forEach(d => {
            Object.keys(d.tables).forEach(table => {
                if (!all[table]) {
                    all[table] = [];
                }
                all[table] = all[table].concat(d.tables[table]);
            })
        });
        return all;
    }

}