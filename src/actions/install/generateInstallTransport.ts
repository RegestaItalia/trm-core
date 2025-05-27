import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { getPackageNamespace, TrmServerUpgrade } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";

/**
 * Generate install transport
 * 
 * 1- check no temporary objects; it's sufficient to check that the namespace is not $
 * 
 * 2- check if a trm install transport already exists, create if it does not
 * 
 * 3- add comments, documentation and rename transport
 * 
 * 4- add tadir objects and try to lock
 * 
 * 5- include language transport 
 * 
 * 6- include customizing transport 
 * 
 * 7- add namespace
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
                Logger.warning(`Install transport was not generated because the package contains non-transportable objects.`);
                return;
            }

            Logger.loading(`Checking install transport...`);

            //2- check if a trm install transport already exists, create if it does not
            context.runtime.installData.transport = await SystemConnector.getPackageWorkbenchTransport(context.runtime.remotePackageData.trmPackage);
            if (context.runtime.installData.transport) {
                Logger.log(`Install transport (${context.runtime.installData.transport.trkorr}) already exists, won't create a new one.`, true);
                Logger.loading(`Updating install transport...`);
                if (TrmServerUpgrade.getInstance().removeComments()) {
                    await context.runtime.installData.transport.removeComments();
                }
            } else {
                Logger.loading(`Generating install transport...`);
                context.runtime.installData.transport = await Transport.createWb({
                    text: `TRM generated transport`, //temporary name
                    target: context.rawInput.installData.installTransport.targetSystem || ''
                });
                Logger.log(`Generated transport ${context.runtime.installData.transport.trkorr}`, true);
            }

            //3- add comments, documentation and rename transport
            await context.runtime.installData.transport.addComment(`name=${context.runtime.remotePackageData.trmManifest.name}`);
            await context.runtime.installData.transport.addComment(`version=${context.runtime.remotePackageData.trmManifest.version}`);
            await context.runtime.installData.transport.setDocumentation(context.runtime.remotePackageData.manifest.getAbapXml());
            await context.runtime.installData.transport.rename(`@X1@TRM: ${context.runtime.remotePackageData.trmManifest.name} v${context.runtime.remotePackageData.trmManifest.version}`);

            //4- add tadir objects and try to lock
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
            var trObjs = await context.runtime.installData.transport.getE071();
            const tasks = await context.runtime.installData.transport.getTasks();
            for(const task of tasks){
                trObjs = trObjs.concat(await task.getE071());
            }
            trObjs.forEach(o => {
                //remove objects that are already in transport or its tasks
                tadirObjects = tadirObjects.filter(k => !(k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName));
            });
            for (const tadir of tadirObjects) {
                try {
                    try {
                        Logger.log(`Adding object ${tadir.pgmid} ${tadir.object} ${tadir.objName} with lock`, true);
                        await context.runtime.installData.transport.addObjects([tadir], true);
                    } catch (e) {
                        Logger.log(`Failed, adding object ${tadir.pgmid} ${tadir.object} ${tadir.objName} without lock`, true);
                        await context.runtime.installData.transport.addObjects([tadir], false);
                    }
                } catch (e) {
                    //object might be in transport already
                    Logger.error(`Failed adding object ${tadir.pgmid} ${tadir.object} ${tadir.objName}`, true);
                    Logger.error(e.toString(), true);
                }
            }

            //5- include language transport
            if (context.runtime.packageTransports.lang.instance) {
                try {
                    Logger.log(`Including language transport ${context.runtime.packageTransports.lang.instance.trkorr}`, true);
                    await context.runtime.installData.transport.addObjectsFromTransport(context.runtime.packageTransports.lang.instance.trkorr);
                } catch (e) {
                    Logger.error(`Failed including language transport ${context.runtime.packageTransports.lang.instance.trkorr}`, true);
                    Logger.error(e.toString(), true);
                }
            }

            //6- include customizing transport
            if (context.runtime.packageTransports.cust.instance) {
                try {
                    Logger.log(`Including customizing transport ${context.runtime.packageTransports.cust.instance.trkorr}`, true);
                    await context.runtime.installData.transport.addObjectsFromTransport(context.runtime.packageTransports.cust.instance.trkorr);
                } catch (e) {
                    Logger.error(`Failed including customizing transport ${context.runtime.packageTransports.cust.instance.trkorr}`, true);
                    Logger.error(e.toString(), true);
                }
            }

            //7- add namespace
            if (context.runtime.installData.namespace[0] === '/') {
                Logger.log(`Adding namespace ${context.runtime.installData.namespace} without lock`, true);
                try {
                    await context.runtime.installData.transport.addObjects([{
                        pgmid: 'R3TR',
                        object: 'NSPC',
                        objName: context.runtime.installData.namespace
                    }], false);
                } catch (e) {
                    Logger.error(`Failed adding namespace ${context.runtime.installData.namespace}`, true);
                    Logger.error(e.toString(), true);
                }
            }

            Logger.success(`Use ${context.runtime.installData.transport.trkorr} for transports in your landscape.`);
        } catch (e) {
            Logger.error(`An error occurred during install transport generation.`);
            Logger.error(e.toString(), true);
        }
    }
}