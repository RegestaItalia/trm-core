import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TADIR } from "../../client";
import { normalize } from "../../commons";

export const checkTadirContent: Step<InstallWorkflowContext> = {
    name: 'check-tadir-content',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.tadirTransport){
            return true;
        }else{
            Logger.log(`Skip TADIR content check (no tadir transports were found in package)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //all tadir object must have the corresponding devc devclass object
        //check all objects in transport are recognized by the system
        const r3trans = context.runtime.r3trans;
        const tadirTransport = context.runtime.tadirTransport;
        const transportData = tadirTransport.binaries.data;
        const tdevc = context.runtime.tdevcData;

        Logger.loading(`Checking package objects content...`);
        const aTadir: TADIR[] = normalize(await r3trans.getTableEntries(transportData, 'TADIR'));
        
        Logger.log(`Adding ${aTadir.length} objects to workbench transport (not generated yet)`, true);
        const wbObjects = context.runtime.workbenchObjects.concat(aTadir.map(o => {
            return {
                pgmid: o.pgmid,
                object: o.object,
                objName: o.objName
            }
        }));
        context.runtime.workbenchObjects = wbObjects;
        
        aTadir.forEach(o => {
            if (!tdevc.find(k => k.devclass === o.devclass)) {
                Logger.error(`Object ${o.pgmid} ${o.object} ${o.objName}, devclass ${o.devclass} not found in DEVC transport!`, true);
                throw new Error(`Package includes objects without devclass.`);
            }
        });

        context.runtime.tadirData = aTadir;
    }
}