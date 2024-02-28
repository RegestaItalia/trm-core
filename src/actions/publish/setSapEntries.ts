import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";


export const setSapEntries: Step<WorkflowContext> = {
    name: 'set-sap-entries',
    filter: async (context: WorkflowContext): Promise<boolean> => {
        const sapEntries = (context.runtime.dependencies || []).filter(o => !o.trmPackage);
        if (sapEntries.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping SAP entries search beacuse no SAP entries were found`, true);
            return false;
        }
    },
    run: async (context: WorkflowContext): Promise<void> => {
        const sapEntries = (context.runtime.dependencies || []).filter(o => !o.trmPackage);
        sapEntries.forEach(d => {
            if (d.isSap) {
                if (!context.runtime.manifest.sapEntries['TADIR']) {
                    context.runtime.manifest.sapEntries['TADIR'] = [];
                }
                d.tadir.forEach(t => {
                    var arrayIndex = context.runtime.manifest.sapEntries['TADIR'].findIndex(o => o['PGMID'] === t.pgmid && o['OBJECT'] === t.object && o['OBJ_NAME'] === t.objName);
                    if (arrayIndex < 0) {
                        arrayIndex = context.runtime.manifest.sapEntries['TADIR'].push({
                            "PGMID": t.pgmid,
                            "OBJECT": t.object,
                            "OBJ_NAME": t.objName
                        });
                        arrayIndex--;
                    }
                    Logger.info(`Found dependency with TADIR ${t.pgmid} ${t.object} ${t.objName}`, true);
                });
            } else {
                d.tadir.forEach(t => {
                    Logger.error(`Object ${t.object} ${t.objName} of devclass ${t.devclass} has no TRM Package.`);
                });
                throw new Error(`All objects must be included in a TRM Package in order to continue.`);
            }
        });
    }
}