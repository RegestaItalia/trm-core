import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Read repository environment
 * 
 * 1- read repository environment for each tadir object
 * 
*/
export const readRepositoryEnvironment: Step<FindDependenciesWorkflowContext> = {
    name: 'read-repository-environment',
    filter: async (context: FindDependenciesWorkflowContext): Promise<boolean> => {
        if (context.runtime.abort) {
            Logger.log(`Skipping repository environment read (abort)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Read repository environment step', true);

        //1- read repository environment for each tadir object
        const aTadir = context.rawInput.packageData.objects.filter(o =>
            !context.runtime.packageData.ignoredTadir.find(k => k.pgmid === o.pgmid &&
                k.object === o.object &&
                k.objName === o.objName)
        );
        Logger.loading(`Reading objects...`);
        for (const tadir of aTadir) {
            //search if senvi entry for the same object and object name exists
            const senviEntry = context.runtime.repositoryEnvironment.senvi.find(o => o.tadir.object === tadir.object && o.tadir.objName === tadir.objName);
            if(senviEntry){
                context.runtime.repositoryEnvironment.senvi.push({
                    tadir: tadir,
                    senvi: senviEntry.senvi
                });
            }else{
                Logger.log(`Running repository environment on object ${tadir.object} ${tadir.objName}...`, true);
                try {
                    context.runtime.repositoryEnvironment.senvi.push({
                        tadir: tadir,
                        senvi: await SystemConnector.repositoryEnvironment(tadir.object, tadir.objName)
                    });
                } catch (e) {
                    Logger.error(e.toString(), true);
                }
            }
        }
    }
}