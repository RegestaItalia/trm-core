import { Logger } from "trm-commons";
import { DEVCLASS, TDEVC, ZTRM_OBJECT_DEPENDENCIES } from "../client";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { DependenciesGenericTable, ObjectDependencies } from "./ObjectDependencies";

export type GenericPackageDependencies = {
    package: TDEVC,
    dependencies: DependenciesGenericTable[]
}

export class PackageDependencies {

    public readonly dependencies: ObjectDependencies[] = [];
    private devclasses: DEVCLASS[];

    constructor(public readonly devclass: DEVCLASS) {}
    
    public async setDependencies(packageDependencies: ZTRM_OBJECT_DEPENDENCIES[], log?: boolean): Promise<PackageDependencies> {
        var i = 1;
      Logger.loading(`Analyzing dependencies (0.0%)...`, !log);
        for(const d of packageDependencies){
            Logger.loading(`Analyzing dependencies (${(((i + 1) / packageDependencies.length) * 100).toFixed(1)}%)...`, !log);
            Logger.loading(`Analyzing dependencies (${(((i + 1) / packageDependencies.length) * 100).toFixed(1)}%) > ${d.pgmid}${d.object}${d.objName}...`, true);
            i++;
            this.dependencies.push(await (new ObjectDependencies(d.object, d.objName).setDependencies(d.dependencies || [])));
        }
        return this;
    }

    private async getDevclasses(): Promise<DEVCLASS[]> {
        if(!this.devclasses){
            this.devclasses = [this.devclass].concat((await SystemConnector.getSubpackages(this.devclass)).map(o => o.devclass));
        }
        return this.devclasses;
    }

    public getAllDependencies(): any {
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

    public async getTrmDependencies(): Promise<TrmPackage[]> {
        var trmPackages: TrmPackage[] = [];
        const devclasses = await this.getDevclasses();
        this.dependencies.forEach(d => {
            d.trmPackages.forEach(p => {
                if(!devclasses.includes(p.trmPackage.getDevclass())){
                    trmPackages.push(p.trmPackage);
                }
            });
        });
        return trmPackages;
    }

    public async getOtherPackageDependencies(): Promise<GenericPackageDependencies[]> {
        var sapPackages: GenericPackageDependencies[] = [];
        for(const d of this.dependencies){
            for(const p of d.sapPackages){
                var index = sapPackages.findIndex(o => o.package.devclass === p.package);
                if(index < 0){
                    index = sapPackages.push({
                        package: await SystemConnector.getDevclass(p.package),
                        dependencies: []
                    }) - 1;
                }
                sapPackages[index].dependencies = sapPackages[index].dependencies.concat(p.dependencies);
            }
        }
        return sapPackages;
    }

}