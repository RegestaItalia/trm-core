import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";

export const checkTadirObjectTypes: Step<InstallWorkflowContext> = {
    name: 'check-tadir-object-types',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.tadirTransport){
            if(context.parsedInput.checkObjectTypes){
                return true;
            }else{
                Logger.log(`Skip TADIR object type check (input)`, true);
                return false;
            }
        }else{
            Logger.log(`Skip TADIR object type check (no tadir transports were found in package)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const aTadir = context.runtime.tadirData;
        Logger.loading(`Checking package objects types...`);
        const systemObjectList = await SystemConnector.getObjectsList();
        aTadir.forEach(o => {
            var unknownObjects: string[] = [];
            if (!systemObjectList.find(k => k.pgmid === o.pgmid && k.object === o.object)) {
                unknownObjects.push(`${o.pgmid} ${o.object}`);
                Logger.error(`TADIR transport contains object ${o.pgmid} ${o.object} ${o.objName}, which is not supported by target install system`, true);
            }
            if(unknownObjects.length > 0){
                if(unknownObjects.length === 1){
                    throw new Error(`Transport contains unknown object type ${unknownObjects[0]}.`);
                }else{
                    throw new Error(`Transport contains ${unknownObjects.length} unknown object types (run in verbose for more detail).`);
                }
            }
        });
        Logger.success(`All objects in package "${packageName}" supported.`);
    }
}