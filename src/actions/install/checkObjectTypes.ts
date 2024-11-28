import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { KO100 } from "../../client";

/**
 * Check object types. All object types in transports must be supported on target system.
 * 
 * 1- get system supported object list
 * 
 * 2- check E071 object types
 * 
*/
export const checkObjectTypes: Step<InstallWorkflowContext> = {
    name: 'check-object-types',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.installData.checks.noObjectTypes){
            Logger.log(`Skipping object types check (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check object types step', true);
        
        Logger.loading(`Checking package objects types...`);

        //1- get system supported object list
        const systemObjectList = await SystemConnector.getObjectsList();

        //2- check object types
        var unsupportedObjectTypes: KO100[] = [];
        context.runtime.packageTransportsData.e071.forEach(o => {
            if(!systemObjectList.find(k => k.pgmid === o.pgmid && k.object === k.object)){
                if(!unsupportedObjectTypes.find(k => k.pgmid === o.pgmid && k.object === k.object)){
                    unsupportedObjectTypes.push({
                        pgmid: o.pgmid,
                        object: o.object,
                        text: `${o.pgmid} ${o.object}`
                    });
                }
            }
        });
        if(unsupportedObjectTypes.length > 0){
            Logger.error(`Package contains ${unsupportedObjectTypes.length} unsupported objects:`);
            unsupportedObjectTypes.forEach(o => {
                Logger.error(`  ${o.text}`);
            });
            throw new Error(`Package is not supported on ${SystemConnector.getDest()}.`);
        }
    }
}