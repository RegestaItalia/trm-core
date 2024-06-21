import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext, TableDependency, TrmDependency } from ".";
import { DEVCLASS } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { TrmPackage } from "../../trmPackage";
import { Logger } from "../../logger";

var aRootDevclass: {
    devclass: string,
    rootDevclass: string
}[] = [];

const _getRootDevclass = async (devclass) => {
    const oRootDevclass = aRootDevclass.find(o => o.devclass === devclass);
    if(oRootDevclass){
        return oRootDevclass.rootDevclass;
    }else{
        Logger.loading(`Searching root of devclass ${devclass}...`, true);
        var tdevcDevclass = devclass;
        var rootDevclass = null;
        while(rootDevclass === null){
            const tdevc = await SystemConnector.getDevclass(tdevcDevclass);
            Logger.log(`Parent of ${tdevcDevclass} is ${tdevc.parentcl}`, true);
            if(tdevc.parentcl){
                tdevcDevclass = tdevc.parentcl;
                aRootDevclass.push({
                    devclass: tdevcDevclass,
                    rootDevclass: tdevc.parentcl
                });
            }else{
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
    for (const tadirDependency of tadirDependencies) {
        const tadir: {
            PGMID: string,
            OBJ_NAME: string,
            OBJECT: string,
            DEVCLASS: string
        } = tadirDependency.tableDependency;
        var trmRelevantTransports: Transport[] = [];
        var latestTransport: Transport;
        var devclass: DEVCLASS;
        var trmPackage: TrmPackage;
        var integrity: string;
        var arrayIndex1: number;
        var arrayIndex2: number;
        Logger.log(`Searching transports for object ${tadir.PGMID} ${tadir.OBJECT} ${tadir.OBJ_NAME}`, true);
        const allTransports = await Transport.getTransportsFromObject({
            pgmid: tadir.PGMID,
            object: tadir.OBJECT,
            objName: tadir.OBJ_NAME
        });
        Logger.log(`Found ${allTransports.length} transports for object ${tadir.PGMID} ${tadir.OBJECT} ${tadir.OBJ_NAME}`, true);
        for (const transport of allTransports) {
            if (await transport.isTrmRelevant()) {
                Logger.log(`Transport ${transport.trkorr} is TRM relevant`, true);
                trmRelevantTransports.push(transport);
            }
        }
        latestTransport = await Transport.getLatest(trmRelevantTransports);
        if (latestTransport) {
            Logger.log(`Latest transport is ${latestTransport.trkorr}`, true);
            //has trm package
            trmPackage = await latestTransport.getLinkedPackage();
            const alreadyInArray = trmDependencies.find(o => o.trmPackage && TrmPackage.compare(o.trmPackage, trmPackage))
            if(alreadyInArray){
                devclass = alreadyInArray.devclass;
                integrity = alreadyInArray.integrity;
            }else{
                integrity = await SystemConnector.getPackageIntegrity(trmPackage);
                if(!integrity){
                    throw new Error(`Package "${trmPackage.packageName}", integrity not found!`);
                }
                try{
                    devclass = await latestTransport.getDevclass();
                }catch(e){
                    devclass = '';
                }
            }
        } else {
            Logger.log(`Object without TRM package`, true);
            //doesn't have trm package
            devclass = await _getRootDevclass(tadir.DEVCLASS);
        }
        
        arrayIndex1 = trmDependencies.findIndex(o => o.devclass === devclass);
        if (arrayIndex1 < 0) {
            arrayIndex1 = trmDependencies.push({
                devclass,
                trmPackage,
                integrity,
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
    return trmDependencies;
}

export const setTrmDependencies: Step<FindDependenciesWorkflowContext> = {
    name: 'set-trm-dependencies',
    filter: async (context: FindDependenciesWorkflowContext): Promise<boolean> => {
        const aParsedSenvi = context.runtime.parsedSenvi || [];
        if (aParsedSenvi.length === 0) {
            Logger.log(`Skipping set TRM dependencies (no custom object found)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        const aParsedSenvi = context.runtime.parsedSenvi;
        var trmDependencies: TrmDependency[] = [];
        Logger.loading(`Searching TRM dependencies...`);
        for (const parsedSenvi of aParsedSenvi) {
            if (parsedSenvi.table === 'TADIR') {
                trmDependencies = trmDependencies.concat(await _getTadirDependencies(parsedSenvi.dependencies));
            }
        }
        context.output.trmDependencies = trmDependencies.filter(o => o.trmPackage);
        context.output.unknownDependencies = trmDependencies.filter(o => !o.trmPackage);
    }
}