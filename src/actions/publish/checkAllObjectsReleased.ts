import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Check all objects released
 * 
 * This is needed for the dirty flag the expected behavior
 * 
 * 1- remove gitignore objects
 * 
 * 2- check tadir has content
 * 
 * 2- check all objects released
 * 
*/
export const checkAllObjectsReleased: Step<PublishWorkflowContext> = {
    name: 'check-all-objects-released',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Check all objects released step', true);

        //1- remove gitignore objects
        var aTadir = context.runtime.packageData.tadir.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        context.runtime.abapGitData.sourceCode.ignoredObjects.forEach(o => {
            const objectIndex = aTadir.findIndex(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName);
            if (objectIndex >= 0) {
                aTadir.splice(objectIndex, 1);
            }
        });

        //2- check tadir has content
        if (aTadir.length === 0) {
            throw new Error(`Package ${context.rawInput.packageData.devclass} has no content.`);
        }

        //3- check all objects released
        const locks = await SystemConnector.getPackageObjLocks(context.rawInput.packageData.devclass);
        if(locks.length > 0){
            locks.forEach(l => {
                Logger.error(`${l.pgmid} ${l.object} ${l.objName} currently locked in ${l.trkorr}`);
            });
            throw new Error(`To continue, all objects must be released`);
        }else{
            Logger.log(`All objects released, continue`);
        }
    }
}