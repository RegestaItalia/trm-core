import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { getPackageNamespace } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Manifest } from "../../manifest";
import chalk from "chalk";
import { setTransportTarget } from "../commons/prompts";

/**
 * Generate install transport
 * 
 * 1- check no temporary objects; it's sufficient to check that the namespace is not $
 * 
 * 2- add tadir objects and try to lock
 * 
 * 3- include language transport 
 * 
 * 4- include customizing transports
 * 
 * 5- release/delete install transports
 * 
 * 6- add comments, documentation and rename transport
 * 
*/
export const generateInstallTransport: Step<InstallWorkflowContext> = {
    name: 'generate-install-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installTransport.create) {
            return true;
        } else {
            Logger.log(`Skipping install transport generation (user input)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Generate install transport step', true);

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

            //5- release/delete install transports
            var transportsStatus: {
                type: TrmTransportIdentifier,
                trkorr: string,
                len: number,
                success: boolean
            }[] = [];
            Logger.loading(`Releasing install transports...`);
            for (const transport of context.runtime.installData.transports) {
                var len;
                const index = (transportsStatus.push({
                    type: transport.type,
                    trkorr: transport.transport.trkorr,
                    len: 0,
                    success: false
                }) - 1);
                try {
                    await transport.transport.removeComments();
                    len = (await transport.transport.getE071()).length;
                    transportsStatus[index].len = len;
                    if (len === 0) {
                        await transport.transport.delete();
                    } else {
                        await transport.transport.addComment(`name=${context.runtime.remotePackageData.manifest.name}`);
                        await transport.transport.addComment(`version=${context.runtime.remotePackageData.manifest.version}`);
                        await transport.transport.setDocumentation(new Manifest(context.runtime.remotePackageData.manifest).getAbapXml());
                        await transport.transport.rename(`@X1@TRM: ${context.runtime.remotePackageData.manifest.name} v${context.runtime.remotePackageData.manifest.version} ${transport.type === TrmTransportIdentifier.CUST ? '(C)' : ''}`.trim());
                        await transport.transport.release(true, true);
                    }
                    transportsStatus[index].success = true;
                } catch (e) {
                    Logger.error(`Error on finalize step of transport ${transport.transport.trkorr}`, true);
                    Logger.error(e.toString(), true);
                    transportsStatus[index].success = false;
                }
            }
            transportsStatus.forEach(o => {
                if (o.success) {
                    if (o.len > 0) {
                        Logger.success(`Use ${o.type === TrmTransportIdentifier.TADIR ? 'workbench' : 'customizing'} transport ${chalk.bold(o.trkorr)} in ${SystemConnector.getDest()} landscape transports.`);
                    }
                } else {
                    if (o.len > 0) {
                        Logger.error(`Error on release of ${o.type === TrmTransportIdentifier.TADIR ? 'workbench' : 'customizing'} transport ${chalk.bold(o.trkorr)}.`);
                        context.runtime.installData.transports = context.runtime.installData.transports.filter(o => o.transport.trkorr !== o.transport.trkorr);
                    }
                }
            });
        } catch (e) {
            Logger.error(`An error occurred during install transport generation.`);
            Logger.error(`This error may be ignored.`);
            Logger.error(e.toString(), true);
        }
    }
}