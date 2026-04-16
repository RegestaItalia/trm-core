import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { TADIR_KEY } from "../../client";

/**
 * Check objects lock (only when install transports are requested).
 * 
 * All objects must not be locked.
 * 
*/
export const checkObjectsLock: Step<InstallWorkflowContext> = {
    name: 'check-objects-lock',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installTransport.create) {
            return true;
        } else {
            Logger.log(`Skipping objects lock (user input, no install transport)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check objects lock step', true);
        
        const devclass: TADIR_KEY[] = context.runtime.generatedData.devclass.map(d => {
            return {
                PGMID: 'R3TR',
                OBJECT: 'DEVC',
                OBJ_NAME: d
            };
        });
        const locks = await SystemConnector.getObjectsLocks(devclass.concat(context.runtime.packageTransportsData.e071.map(o => {
            return {
                PGMID: o.pgmid,
                OBJECT: o.object,
                OBJ_NAME: o.objName
            };
        })));
        if(locks.length > 0){
            locks.forEach(l => {
                Logger.error(`${l.pgmid} ${l.object} ${l.objName} is currently locked in transport ${l.trkorr}`);
            });
            throw new Error(`To generate install transports, all objects must be released`);
        }else{
            Logger.log(`All objects released, continue`, true);
        }
    }
}