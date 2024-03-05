import { Step } from "@sammarks/workflow";
import { TadirDependency, FindDependenciesPublishWorkflowContext } from ".";
import { TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { TrmPackage } from "../../trmPackage";
import { Logger } from "../../logger";

const SAP_SOURCE_SYSTEMS = ['SAP'];
const SAP_AUTHORS = ['SAP'];

const _findDependency = async (tadirDependency: TADIR, packageDependencies: TadirDependency[]): Promise<TadirDependency[]> => {
    var latestTransport: Transport;
    var isSap = false;
    if (SAP_SOURCE_SYSTEMS.includes(tadirDependency.srcsystem) || SAP_AUTHORS.includes(tadirDependency.author)) {
        isSap = true;
    }
    Logger.log(`Object ${tadirDependency.pgmid} ${tadirDependency.object} ${tadirDependency.objName} is SAP owned: ${isSap}`, true);
    if (!isSap) {
        var trmRelevantTransports: Transport[] = [];
        Logger.log(`Searching transports for object ${tadirDependency.pgmid} ${tadirDependency.object} ${tadirDependency.objName}`, true);
        const allTransports = await Transport.getTransportsFromObject({
            pgmid: tadirDependency.pgmid,
            object: tadirDependency.object,
            objName: tadirDependency.objName
        });
        Logger.log(`Found ${allTransports.length} transports for object ${tadirDependency.pgmid} ${tadirDependency.object} ${tadirDependency.objName}`, true);
        for (const transport of allTransports) {
            if (await transport.isTrmRelevant()) {
                Logger.log(`Transport ${transport.trkorr} is TRM relevant`, true);
                trmRelevantTransports.push(transport);
            }
        }
        latestTransport = await Transport.getLatest(trmRelevantTransports);
    }
    var arrayIndex: number;
    if (latestTransport) {
        Logger.log(`TRM transport for object ${tadirDependency.pgmid} ${tadirDependency.object} ${tadirDependency.objName}: ${latestTransport.trkorr}`, true);
        const linkedPackage = await latestTransport.getLinkedPackage();
        Logger.log(`TRM package for transport ${latestTransport.trkorr} is ${linkedPackage.packageName}`, true);
        arrayIndex = packageDependencies.findIndex(o => o.trmPackage && TrmPackage.compare(o.trmPackage, linkedPackage));
        if (arrayIndex < 0) {
            const integrity = await SystemConnector.getPackageIntegrity(linkedPackage);
            if(!integrity){
                throw new Error(`Package ${linkedPackage.packageName}, integrity not found!`);
            }
            Logger.log(`Dependency with ${linkedPackage.packageName} found, integrity ${integrity}`, true);
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
        Logger.log(`Object ${tadirDependency.pgmid} ${tadirDependency.object} ${tadirDependency.objName} has no TRM transport`, true);
        arrayIndex = packageDependencies.findIndex(o => !o.trmPackage && o.isSap === isSap);
        if (arrayIndex < 0) {
            Logger.log(`Dependency with SAP object found`, true);
            arrayIndex = packageDependencies.push({
                trmPackage: null,
                isSap,
                tadir: []
            });
            arrayIndex--;
        }
        packageDependencies[arrayIndex].tadir.push(tadirDependency);
    }
    return packageDependencies;
}

export const setDependencies: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'set-dependencies',
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        var packageDependencies: TadirDependency[] = [];
        const tadirDependencies = context.runtime.tadirDependencies;

        Logger.loading(`Searching for dependencies...`);
        for (const tadirDependency of tadirDependencies) {
            packageDependencies = await _findDependency(tadirDependency, packageDependencies);
        }

        context.output.dependencies = packageDependencies;
        context.runtime.trmPackageDependencies = packageDependencies.filter(o => o.trmPackage).map(o => o.trmPackage);
    }
}