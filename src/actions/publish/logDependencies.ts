import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";


export const logDependencies: Step<PublishWorkflowContext> = {
    name: 'log-dependencies',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        if (context.runtime.manifest.sapEntries) {
            var sapEntriesCount = 0;
            Object.keys(context.runtime.manifest.sapEntries).forEach(k => {
                try{
                    sapEntriesCount += context.runtime.manifest.sapEntries[k].length;
                }catch(e){
                    throw new Error(`Invalid SAP entry in manifest at key "${k}" (expected array)`);
                }
            });
            Logger.info(`This package requires ${sapEntriesCount} SAP entries.`);
        }
        Logger.info(`This package requires ${context.runtime.manifest.dependencies.length} TRM dependencies.`);
    }
}