import { Logger } from "trm-commons";
import { DEVCLASS, TDEVC, ZTRM_OBJECT_DEPENDENCIES } from "../client";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { ObjectDependencies } from "./ObjectDependencies";
import * as _ from "lodash";

export type TrmPackageDependency = {
    trmPackage: TrmPackage,
    foundIn: {
        object: string,
        objName: string
    }[]
}

export type AbapPackageDependency = {
    abapPackage: TDEVC,
    isCustomerPackage: boolean,
    entries: {
        tableName: string,
        dependency: {
            tableKey: any,
            foundIn: {
                object: string,
                objName: string
            }[]
        }[]
    }[]
}

export class PackageDependencies {

    public readonly allDependencies: ObjectDependencies[] = [];
    public readonly trmPackageDependencies: TrmPackageDependency[] = [];
    public readonly abapPackageDependencies: AbapPackageDependency[] = [];
    private devclasses: DEVCLASS[];

    constructor(public readonly devclass: DEVCLASS) { }

    public async setDependencies(packageDependencies: ZTRM_OBJECT_DEPENDENCIES[], log?: boolean): Promise<PackageDependencies> {
        var i = 1;
        Logger.loading(`Analyzing dependencies (0.0%)...`, !log);
        for (const d of packageDependencies) {
            Logger.loading(`Analyzing dependencies (${(((i + 1) / packageDependencies.length) * 100).toFixed(1)}%)...`, !log);
            Logger.loading(`Analyzing dependencies (${(((i + 1) / packageDependencies.length) * 100).toFixed(1)}%) > ${d.pgmid}${d.object}${d.objName}...`, true);
            i++;
            this.allDependencies.push(await (new ObjectDependencies(d.object, d.objName).setDependencies(d.dependencies || [])));
        }
        Logger.loading(`Building dependency tree...`, !log);
        for (const o of this.allDependencies) {
            for (const trmPackage of o.trmPackages) {
                // only if the abap package of the trm package is not the same as the one analyzed
                if (trmPackage.trmPackage.getDevclass() !== this.devclass) {
                    var depIndex = this.trmPackageDependencies.findIndex(k => k.trmPackage.compareName(trmPackage.trmPackage.packageName) && k.trmPackage.compareRegistry(trmPackage.trmPackage.registry));
                    if (depIndex < 0) {
                        depIndex = this.trmPackageDependencies.push({
                            trmPackage: trmPackage.trmPackage,
                            foundIn: []
                        }) - 1;
                    }
                    if (!this.trmPackageDependencies[depIndex].foundIn.find(f => f.object === o.object && f.objName === f.objName)) {
                        this.trmPackageDependencies[depIndex].foundIn.push({
                            object: o.object,
                            objName: o.objName
                        });
                    }
                }
            }
            for (const sapPackage of o.sapPackages) {
                for (const dep of sapPackage.dependencies) {
                    // only if the abap package is not a subpackage of the one analyzed
                    if (!(await this.getDevclasses()).includes(sapPackage.package)) {

                        // get the root, in trm we assume subpackages are part of the same package (supposing the user will generate on after a mising dependency)
                        const root = await SystemConnector.getRootDevclass(sapPackage.package);
                        var packageIndex = this.abapPackageDependencies.findIndex(k => k.abapPackage.devclass === root);
                        if (packageIndex < 0) {
                            const abapPackage = await SystemConnector.getDevclass(root);
                            packageIndex = this.abapPackageDependencies.push({
                                abapPackage: abapPackage,
                                isCustomerPackage: !abapPackage.tpclass,
                                entries: []
                            }) - 1;
                        }
                        var tabIndex = this.abapPackageDependencies[packageIndex].entries.findIndex(k => k.tableName === dep.tabname);
                        if (tabIndex < 0) {
                            tabIndex = this.abapPackageDependencies[packageIndex].entries.push({
                                tableName: dep.tabname,
                                dependency: []
                            }) - 1;
                        }
                        dep.tabkey.forEach(tableKey => {
                            var tableKeyIndex = this.abapPackageDependencies[packageIndex].entries[tabIndex].dependency.findIndex(k => _.isEqual(k.tableKey, tableKey));
                            if (tableKeyIndex < 0) {
                                tableKeyIndex = this.abapPackageDependencies[packageIndex].entries[tabIndex].dependency.push({
                                    tableKey,
                                    foundIn: []
                                }) - 1;
                            }
                            this.abapPackageDependencies[packageIndex].entries[tabIndex].dependency[tableKeyIndex].foundIn.push({
                                object: o.object,
                                objName: o.objName
                            });
                        });
                    }
                }
            }
        }
        return this;
    }

    private async getDevclasses(): Promise<DEVCLASS[]> {
        if (!this.devclasses) {
            this.devclasses = [this.devclass].concat((await SystemConnector.getSubpackages(this.devclass)).map(o => o.devclass));
        }
        return this.devclasses;
    }

}