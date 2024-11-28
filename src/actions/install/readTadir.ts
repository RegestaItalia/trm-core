import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { normalize } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { TADIR } from "../../client";

/**
 * Read TADIR and check objects existance on target system.
 * 
 * 1- read TADIR
 * 
 * 2- check objects existance
 * 
*/
export const readTadir: Step<InstallWorkflowContext> = {
    name: 'read-tadir',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Read tadir step', true);
        
        Logger.loading(`Checking package transports...`);

        //1- read TADIR
        context.runtime.packageTransportsData.tadir = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.tadir.binaries.binaries.data, 'TADIR'));
        Logger.log(`TADIR TADIR: ${JSON.stringify(context.runtime.packageTransportsData.tadir)}`, true);

        //2- check objects existance
        var existingObjects: TADIR[] = [];
        //check support for bulk operations
        if (!SystemConnector.getSupportedBulk().getTransportObjects) {
            existingObjects = await SystemConnector.getExistingObjects(context.runtime.packageTransportsData.tadir);
        } else {
            existingObjects = await SystemConnector.getExistingObjectsBulk(context.runtime.packageTransportsData.tadir);
        }
        //if updating and existing object is part of the package (devclass in hierarchy) ok, else throw error
        if(existingObjects.length > 0 && context.runtime.update){
            const rootPackage = context.rawInput.contextData.systemPackages.find(o => o.packageName === context.rawInput.packageData.name);
            //TODO: updating
        }
    }
}