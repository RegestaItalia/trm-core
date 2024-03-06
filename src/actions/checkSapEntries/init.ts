import { Step } from "@sammarks/workflow";
import { CheckSapEntriesWorkflowContext } from ".";

export const init: Step<CheckSapEntriesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        context.parsedInput.packageName = context.rawInput.trmPackage.packageName;
        //context.parsedInput.print = !(context.rawInput.print ? true : false);
        if(context.rawInput.printAll){
            context.parsedInput.printStatus = true;
            context.parsedInput.printOk = true;
            context.parsedInput.printUnsafe = true;
            context.parsedInput.printUnknownTables = true;
        }else{
            context.parsedInput.printStatus = context.rawInput.printStatus ? true : false;
            context.parsedInput.printOk = context.rawInput.printOkEntries ? true : false;
            context.parsedInput.printUnsafe = context.rawInput.printUnsafeEntries ? true : false;
            context.parsedInput.printUnknownTables = context.rawInput.printUnknownTables ? true : false;
        }
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