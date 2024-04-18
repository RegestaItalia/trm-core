import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";


export const setSapEntries: Step<PublishWorkflowContext> = {
    name: 'set-sap-entries',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        const sapEntries = context.runtime.dependencies.sapEntries;
        if (sapEntries.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping SAP entries search beacuse no SAP entries were found`, true);
            return false;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const sapEntries = context.runtime.dependencies.sapEntries;
        var tablesCounter = 0;
        var recordsCounter = 0;
        sapEntries.forEach(o => {
            if (!context.runtime.manifest.sapEntries[o.table]) {
                context.runtime.manifest.sapEntries[o.table] = [];
            }
            tablesCounter++;
            o.dependencies.forEach(k => {
                var tableKeys = k.tableDependency;
                if (o.table === 'TADIR') {
                    delete tableKeys['DEVCLASS'];
                }
                context.runtime.manifest.sapEntries[o.table].push(tableKeys);
                recordsCounter++;
            });
        });
        Logger.info(`Found ${recordsCounter} SAP entries in ${tablesCounter} tables`);
    }
}