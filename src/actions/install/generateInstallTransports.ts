import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { setTransportTarget } from "../commons/prompts";

/**
 * Generate install transports
 * 
 * 1- check no temporary objects; it's sufficient to check that the namespace is not $
 * 
 * 2- add tadir objects and try to lock
 * 
 * 3- include language transport 
 * 
 * 4- include customizing transports
 * 
*/
export const generateInstallTransports: Step<InstallWorkflowContext> = {
    name: 'generate-install-transports',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installTransport.create) {
            return true;
        } else {
            Logger.log(`Skipping install transports generation (user input)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Generate install transports step', true);

        //run in try catch to avoid rollback
        try {
            //1- check no temporary objects; it's sufficient to check that the namespace is not $
            if (getPackageNamespace(context.runtime.installData.namespace) === '$') {
                return;
            }

            Logger.loading(`Reading ${SystemConnector.getDest()} transport targets...`);
            const transportTarget = await setTransportTarget(
                context.rawInput.contextData.noInquirer,
                await SystemConnector.getTransportTargets(),
                context.rawInput.installData.installTransport.targetSystem,
                "Install transport target"
            );
            Logger.loading(`Generating install transports...`);
            context.runtime.installData.transports.push({
                type: TrmTransportIdentifier.TADIR,
                transport: await Transport.createWb({
                    text: `TRM generated transport`, //temporary name, replaced in step 5
                    target: transportTarget
                })
            });
            const noCustomizing = context.rawInput.installData.import.noCust || context.runtime.packageTransports.cust.length === 0;
            if (!noCustomizing) {
                context.runtime.installData.transports.push({
                    type: TrmTransportIdentifier.CUST,
                    transport: await Transport.createCust({
                        text: `TRM generated transport`, //temporary name, replaced in step 5
                        target: transportTarget
                    })
                });
            }

            //2- add tadir objects and try to lock
            var tadirObjects = context.runtime.packageTransportsData.tadir;
            if (context.rawInput.installData.installDevclass.keepOriginal) {
                tadirObjects = tadirObjects.concat(context.runtime.packageTransportsData.tdevc.map(o => {
                    return {
                        pgmid: 'R3TR',
                        object: 'DEVC',
                        objName: o.devclass,
                        devclass: o.devclass
                    };
                }));
            } else {
                tadirObjects = tadirObjects.concat(context.runtime.generatedData.devclass.map(devclass => {
                    return {
                        pgmid: 'R3TR',
                        object: 'DEVC',
                        objName: devclass,
                        devclass: devclass
                    };
                }));
            }
            //add workbench objects to transport
            try {
                Logger.log(`Adding ${tadirObjects.length} workbench objects with lock in bulk`, true);
                await (context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.TADIR)).transport.addObjects(tadirObjects, true);
            } catch {
                Logger.log(`Failed adding in bulk, adding one by one`, true);
                for (const tadir of tadirObjects) {
                    try {
                        try {
                            Logger.log(`Adding object ${tadir.pgmid} ${tadir.object} ${tadir.objName} with lock`, true);
                            await (context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.TADIR)).transport.addObjects([tadir], true);
                        } catch (e) {
                            Logger.log(`Failed ${e.toString()}, adding without lock`, true);
                            await (context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.TADIR)).transport.addObjects([tadir], false);
                        }
                    } catch (e) {
                        Logger.warning(`Failed adding ${tadir.pgmid}${tadir.object}${tadir.objName} to transport ${(context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.TADIR)).transport.trkorr}`);
                        Logger.error(e.toString(), true);
                    }
                }
            }

            //3- include language transport
            if (context.runtime.packageTransports.lang.instance) {
                try {
                    Logger.log(`Including language transport ${context.runtime.packageTransports.lang.instance.trkorr}`, true);
                    await (context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.TADIR)).transport.addObjectsFromTransport(context.runtime.packageTransports.lang.instance.trkorr);
                } catch (e) {
                    Logger.warning(`Failed including language transport ${context.runtime.packageTransports.lang.instance.trkorr} in transport ${(context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.TADIR)).transport.trkorr}`);
                    Logger.error(e.toString(), true);
                }
            }

            //4- include customizing transports
            if (!noCustomizing) {
                for (const cust of context.runtime.packageTransports.cust) {
                    try {
                        Logger.log(`Including customizing transport ${cust.instance.trkorr}`, true);
                        await (context.runtime.installData.transports.find(o => o.type == TrmTransportIdentifier.CUST)).transport.addObjectsFromTransport(cust.instance.trkorr);
                    } catch (e) {
                        Logger.warning(`Failed including customizing transport ${cust.instance.trkorr}`);
                        Logger.error(e.toString(), true);
                    }
                }
            }
        } catch (e) {
            Logger.error(`An error occurred during install transport generation.`);
            Logger.error(`This error may be ignored.`);
            Logger.error(e.toString(), true);
        }
    }
}