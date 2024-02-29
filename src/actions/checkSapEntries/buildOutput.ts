import { Step } from "@sammarks/workflow";
import { CheckSapEntriesWorkflowContext } from ".";

export const buildOutput: Step<CheckSapEntriesWorkflowContext> = {
    name: 'build-output',
    filter: async (context: CheckSapEntriesWorkflowContext): Promise<boolean> => {
        try {
            const items = context.runtime.okEntries.length +
                        context.runtime.okEntries.length;
            return items > 0;
        } catch (e) {
            return false;
        }
    },
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        context.output.sapEntriesStatus = {};
        context.runtime.okEntries.forEach(o => {
            if(!context.output.sapEntriesStatus[o.table]){
                context.output.sapEntriesStatus[o.table] = [];
            }
            context.output.sapEntriesStatus[o.table].push({
                status: true,
                entry: o.tableEntry
            });
        });
        context.runtime.koEntries.forEach(o => {
            if(!context.output.sapEntriesStatus[o.table]){
                context.output.sapEntriesStatus[o.table] = [];
            }
            context.output.sapEntriesStatus[o.table].push({
                status: false,
                entry: o.tableEntry
            });
        });
    }
}