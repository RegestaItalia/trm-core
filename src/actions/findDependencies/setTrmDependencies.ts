import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext, TableDependency, TrmDependency } from ".";
import { Logger } from "trm-commons";
import { DEVCLASS, TADIR, TRKORR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { TrmPackage } from "../../trmPackage";

var aRootDevclass: {
    devclass: string,
    rootDevclass: string
}[] = [];

var trmServerPackage: TrmPackage;
var trmRestPackage: TrmPackage;

var transportsCache: {
    trkorr: TRKORR,
    trmRelevant: boolean,
    devclass?: string
}[] = [];

var transportsObjectCache: Transport[] = [];

const _getRootDevclass = async (devclass) => {
    const oRootDevclass = aRootDevclass.find(o => o.devclass === devclass);
    if (oRootDevclass) {
        return oRootDevclass.rootDevclass;
    } else {
        Logger.loading(`Searching root of devclass ${devclass}...`, true);
        var tdevcDevclass = devclass;
        var rootDevclass = null;
        while (rootDevclass === null) {
            const tdevc = await SystemConnector.getDevclass(tdevcDevclass);
            Logger.log(`Parent of ${tdevcDevclass} is ${tdevc.parentcl}`, true);
            if (tdevc.parentcl) {
                tdevcDevclass = tdevc.parentcl;
                aRootDevclass.push({
                    devclass: tdevcDevclass,
                    rootDevclass: tdevc.parentcl
                });
            } else {
                rootDevclass = tdevcDevclass;
                aRootDevclass.push({
                    devclass: tdevcDevclass,
                    rootDevclass: tdevcDevclass
                });
            }
        }
        Logger.success(`Root devclass of ${devclass} is ${rootDevclass}`, true);
        return rootDevclass;
    }
}

const _getTadirDependencies = async (tadirDependencies: TableDependency[]): Promise<TrmDependency[]> => {
    var trmDependencies: TrmDependency[] = [];
    var index: number = 0;
    if (!trmServerPackage) {
        try {
            trmServerPackage = await SystemConnector.getTrmServerPackage();
        } catch { }
    }
    if (!trmRestPackage) {
        try {
            trmRestPackage = await SystemConnector.getTrmRestPackage();
        } catch { }
    }
    for (const tadirDependency of tadirDependencies) {
        index++;
        Logger.loading(`(${index}/${tadirDependencies.length}) Searching TRM dependencies...`);
        const tadir: TADIR = {
            pgmid: tadirDependency.object.PGMID,
            object: tadirDependency.object.OBJECT,
            objName: tadirDependency.object.OBJ_NAME,
            devclass: tadirDependency.object.DEVCLASS
        };
        var trmRelevantTransports: Transport[] = [];
        var latestTransport: Transport;
        var devclass: DEVCLASS;
        var trmPackage: TrmPackage;
        var arrayIndex1: number;
        var arrayIndex2: number;
        var append: boolean;
        if (trmServerPackage && trmServerPackage.getDevclass() === tadir.devclass) {
            Logger.log(`Dependency with TRM SERVER package`, true);
            devclass = trmServerPackage.getDevclass();
            trmPackage = trmServerPackage;
            append = true;
        } else if (trmRestPackage && trmRestPackage.getDevclass() === tadir.devclass) {
            Logger.log(`Dependency with TRM REST package`, true);
            devclass = trmRestPackage.getDevclass();
            trmPackage = trmRestPackage;
            append = true;
        } else {
            Logger.log(`Searching transports for object ${tadir.pgmid} ${tadir.object} ${tadir.objName}`, true);
            const allTransports = await Transport.getTransportsFromObject(tadir, transportsObjectCache);
            Logger.log(`Found ${allTransports.length} transports for object ${tadir.pgmid} ${tadir.object} ${tadir.objName}`, true);
            for (const transport of allTransports) {
                if (transportsObjectCache.find(o => o.trkorr === transport.trkorr)) {
                    transportsObjectCache.push(transport);
                }
                const transportCache = transportsCache.find(o => o.trkorr === transport.trkorr);
                if (transportCache) {
                    Logger.log(`Transport ${transport.trkorr} in cache, not reading again...`, true);
                    if (transportCache.trmRelevant) {
                        trmRelevantTransports.push(transport);
                    }
                } else {
                    const iTransportsCache = transportsCache.push({
                        trkorr: transport.trkorr,
                        trmRelevant: false
                    }) - 1;
                    if (await transport.isTrmRelevant()) {
                        Logger.log(`Transport ${transport.trkorr} is TRM relevant`, true);
                        trmRelevantTransports.push(transport);
                        transportsCache[iTransportsCache].trmRelevant = true;
                    }
                }
            }
            latestTransport = await Transport.getLatest(trmRelevantTransports);
            if (latestTransport) {
                Logger.log(`Latest transport is ${latestTransport.trkorr}`, true);
                const iTransportsCache = transportsCache.findIndex(o => o.trkorr === latestTransport.trkorr);
                if (transportsCache[iTransportsCache].devclass) {
                    Logger.log(`Transport ${latestTransport.trkorr} in cache, not reading again...`, true);
                    devclass = transportsCache[iTransportsCache].devclass;
                } else {
                    //has trm package
                    trmPackage = await latestTransport.getLinkedPackage();
                    const alreadyInArray = trmDependencies.find(o => o.package && TrmPackage.compare(o.package, trmPackage))
                    if (alreadyInArray) {
                        devclass = alreadyInArray.devclass;
                    } else {
                        try {
                            devclass = await latestTransport.getDevclass();
                        } catch (e) {
                            devclass = '';
                        }
                    }
                    transportsCache[iTransportsCache].devclass = devclass;

                }
                append = true;
            } else {
                devclass = await _getRootDevclass(tadir.devclass);
                if (devclass && !tadirDependencies.find(o => o.object.PGMID === 'R3TR' && o.object.OBJECT === 'DEVC' && o.object.OBJ_NAME === devclass)) {
                    //this root might be TRM package
                    //add as a dependency, will check later
                    tadirDependencies.push({
                        object: {
                            PGMID: 'R3TR',
                            OBJECT: 'DEVC',
                            OBJ_NAME: devclass,
                            DEVCLASS: devclass
                        },
                        foundIn: tadir
                    });
                    append = false;
                } else {
                    Logger.log(`Object without TRM package`, true);
                    //doesn't have trm package
                    append = true;
                }
            }
        }
        if (append) {
            arrayIndex1 = trmDependencies.findIndex(o => o.devclass === devclass);
            if (arrayIndex1 < 0) {
                arrayIndex1 = trmDependencies.push({
                    devclass,
                    package: trmPackage,
                    sapEntries: []
                });
                arrayIndex1--;
            }
            arrayIndex2 = trmDependencies[arrayIndex1].sapEntries.findIndex(o => o.table === 'TADIR');
            if (arrayIndex2 < 0) {
                arrayIndex2 = trmDependencies[arrayIndex1].sapEntries.push({
                    table: 'TADIR',
                    dependencies: []
                });
                arrayIndex2--;
            }
            trmDependencies[arrayIndex1].sapEntries[arrayIndex2].dependencies.push(tadirDependency);
        }
    }
    return trmDependencies;
}

/**
 * For all objects found, search its TRM package. If not found, get the root ABAP package of the object.
 * 
 * 1- search dependencies with TADIR table
 * 
*/
export const setTrmDependencies: Step<FindDependenciesWorkflowContext> = {
    name: 'set-trm-dependencies',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Set TRM dependencies step', true);

        //1- search dependencies with TADIR table
        var trmDependencies: TrmDependency[] = [];
        Logger.loading(`Searching TRM dependencies...`);
        for (const entryDependency of context.runtime.dependencies.customObjects) {
            if (entryDependency.table === 'TADIR') {
                trmDependencies = trmDependencies.concat(await _getTadirDependencies(entryDependency.dependencies));
            }
        }
        context.runtime.dependencies.withTrmPackage = trmDependencies.filter(o => o.package);
        context.runtime.dependencies.withoutTrmPackage = trmDependencies.filter(o => !o.package);
    }
}