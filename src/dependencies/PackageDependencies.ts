import { DEVCLASS, ZTRM_OBJECT_DEPENDENCIES } from "../client";
import { ObjectDependencies } from "./ObjectDependencies";

export class PackageDependencies {

    public readonly dependencies: ObjectDependencies[] = [];

    constructor(public readonly devclass: DEVCLASS, packageDependencies: ZTRM_OBJECT_DEPENDENCIES[]) {
        packageDependencies.forEach(d => {
            this.dependencies.push(new ObjectDependencies(d.pgmid, d.object, d.objName, d.dependencies));
        })
    }

    public getAll(): any {
        var all = {};
        var pushToTable = (table, o) => {
            if (!all[table]) {
                all[table] = [];
            }
            all[table].push(o);
        }
        this.dependencies.forEach(d => {
            d.tadir.forEach(o => {
                pushToTable('TADIR', o);
            });
            d.tfdir.forEach(o => {
                pushToTable('TFDIR', o);
            });
        });
        return all;
    }

}