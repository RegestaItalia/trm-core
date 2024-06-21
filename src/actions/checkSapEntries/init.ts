import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckSapEntriesWorkflowContext } from ".";

export const init: Step<CheckSapEntriesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        context.parsedInput.packageName = context.rawInput.trmPackage.packageName;
        context.parsedInput.print = !(context.rawInput.print ? true : false);
        if(context.rawInput.trmPackage.manifest){
            const manifest = context.rawInput.trmPackage.manifest.get();
            context.parsedInput.sapEntries = manifest.sapEntries || {};
        }else{
            context.parsedInput.sapEntries = {};
        }
        context.output = {
            sapEntries: context.parsedInput.sapEntries
        };
    }
}