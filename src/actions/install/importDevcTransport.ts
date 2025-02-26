import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { TADIR } from "../../client";

/**
 * Import DEVC Transport.
 * 
 * 1- check if root devclass already exists. save parent devclass for later
 * 
 * 2- upload transport into system
 * 
 * 3 - delete from tms buffer (if it exists)
 * 
 * 4- import transport into system
 * 
 * 5- replace root devclass parent devclass
 * 
 * 6- set TRM as source
 * 
 * 7- set transport layer
 * 
*/
export const importDevcTransport: Step<InstallWorkflowContext> = {
    name: 'import-devc-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.installData.installDevclass.keepOriginal){
            return true;
        }else{
            Logger.log(`Skipping import DEVC transport (user input - devclass already generated)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Import DEVC Transport step', true);
        
        //1- check if root devclass already exists. save parent devclass for later
        Logger.loading(`Getting ready to import...`);
        const rootDevclass = await SystemConnector.getDevclass(context.runtime.originalData.hierarchy.devclass);

        Logger.loading(`Importing...`);
        const importTimeout = context.rawInput.installData.import.timeout;

        //2- upload transport into system
        Logger.loading(`Uploading ${context.runtime.packageTransports.devc.binaries.trkorr}`, true);
        context.runtime.packageTransports.devc.instance = await Transport.upload({
            binary: context.runtime.packageTransports.devc.binaries.binaries,
            trTarget: SystemConnector.getDest(),
            r3transOption: context.rawInput.contextData.r3transOptions
        });

        //3 - delete from tms buffer (if it exists)
        await context.runtime.packageTransports.devc.instance.deleteFromTms(SystemConnector.getDest());

        //4- import transport into system
        Logger.loading(`Importing ${context.runtime.packageTransports.devc.binaries.trkorr}`, true);
        await context.runtime.packageTransports.devc.instance.import(importTimeout);
        Logger.success(`Transport ${context.runtime.packageTransports.devc.binaries.trkorr} imported`, true);
        
        Logger.loading(`Finalizing import...`);
        
        //5- replace root devclass parent devclass
        if(rootDevclass && rootDevclass.parentcl){
            await SystemConnector.setPackageSuperpackage(context.runtime.originalData.hierarchy.devclass, rootDevclass.parentcl)
        }else{
            await SystemConnector.clearPackageSuperpackage(context.runtime.originalData.hierarchy.devclass);
        }

        //6- set TRM as source
        for (const tdevc of context.runtime.packageTransportsData.tdevc) {
            const object: TADIR = {
                pgmid: 'R3TR',
                object: 'DEVC',
                objName: tdevc.devclass,
                devclass: tdevc.devclass,
                srcsystem: 'TRM'
            };
            Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${object.devclass} -> src system ${object.srcsystem}`, true);
            await SystemConnector.tadirInterface(object);
        }

        //7- set transport layer
        for (const tdevc of context.runtime.packageTransportsData.tdevc) {
            Logger.log(`Running TDEVC interface for devclass ${tdevc.devclass} -> transport layer ${context.rawInput.installData.installDevclass.transportLayer}`, true);
            await SystemConnector.setPackageTransportLayer(tdevc.devclass, context.rawInput.installData.installDevclass.transportLayer);
        }
    }
}