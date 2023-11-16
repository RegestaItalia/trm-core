import { Logger } from "../logger";
import { DEVCLASS } from "../rfc/components";
import { SENVI, TADIR } from "../rfc/struct";
import { SenviParser } from "../dependency";
import { SystemConnector } from "../systemConnector";
import { Transport } from "../transport";
import { TrmPackage } from "../trmPackage";

const SAP_SOURCE_SYSTEMS = ['SAP'];
const SAP_AUTHORS = ['SAP'];

export type TadirDependency = {
    trmPackage?: TrmPackage,
    isSap: boolean,
    integrity?: string,
    tadir: TADIR[]
}

export async function findTadirDependencies(data: {
    devclass: DEVCLASS,
    tadir?: TADIR[]
}, system: SystemConnector, logger?: Logger): Promise<TadirDependency[]> {
    const senviParser = new SenviParser(system);
    var tadir = data.tadir;
    var devclass = data.devclass;
    var aSenvi: SENVI[] = [];
    var tadirDependencies: TADIR[] = [];
    var aIgnoredDevclass: DEVCLASS[] = [devclass];
    aIgnoredDevclass = aIgnoredDevclass.concat((await system.getSubpackages(devclass)).map(o => o.devclass));
    if (!tadir) {
        tadir = await system.getDevclassObjects(devclass, true);
    }
    for (const tadirObj of tadir) {
        aSenvi = aSenvi.concat(await system.rfcClient.repositoryEnvironment(tadirObj.object, tadirObj.objName));
    }
    for (const senvi of aSenvi) {
        const tadirDependency = await senviParser.parse(senvi);
        if (tadirDependency) {
            if (!tadirDependencies.find(o => o.pgmid === tadirDependency.pgmid &&
                o.object === tadirDependency.object &&
                o.objName === tadirDependency.objName)) {
                tadirDependencies.push(tadirDependency);
            }
        }
    }
    //remove object in current devclass and subpackages
    tadirDependencies = tadirDependencies.filter(o => !aIgnoredDevclass.includes(o.devclass));

    //for each remaining object, get the latest trm relevant transport
    var packageDependencies: TadirDependency[] = [];
    for (const tadirDependency of tadirDependencies) {
        var latestTransport: Transport;
        var isSap = false;
        if (SAP_SOURCE_SYSTEMS.includes(tadirDependency.srcsystem) || SAP_AUTHORS.includes(tadirDependency.author)) {
            isSap = true;
        }
        if (!isSap) {
            var trmRelevantTransports: Transport[] = [];
            const allTransports = await Transport.getTransportsFromObject({
                pgmid: tadirDependency.pgmid,
                object: tadirDependency.object,
                objName: tadirDependency.objName
            }, system);
            for (const transport of allTransports) {
                if (await transport.isTrmRelevant()) {
                    trmRelevantTransports.push(transport);
                }
            }
            latestTransport = await Transport.getLatest(trmRelevantTransports);
        }
        var arrayIndex: number;
        if (latestTransport) {
            const linkedPackage = await latestTransport.getLinkedPackage();
            arrayIndex = packageDependencies.findIndex(o => o.trmPackage && TrmPackage.compare(o.trmPackage, linkedPackage));
            if (arrayIndex < 0) {
                const integrity = await system.getPackageIntegrity(linkedPackage);
                arrayIndex = packageDependencies.push({
                    trmPackage: linkedPackage,
                    integrity,
                    isSap: false,
                    tadir: []
                });
                arrayIndex--;
            }
            packageDependencies[arrayIndex].tadir.push(tadirDependency);
        } else {
            //dependency without a trm package
            arrayIndex = packageDependencies.findIndex(o => !o.trmPackage && o.isSap === isSap);
            if (arrayIndex < 0) {
                arrayIndex = packageDependencies.push({
                    trmPackage: null,
                    isSap,
                    tadir: []
                });
                arrayIndex--;
            }
            packageDependencies[arrayIndex].tadir.push(tadirDependency);
        }
    }
    return packageDependencies;
}