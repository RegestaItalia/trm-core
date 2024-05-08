import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependencyWorkflowContext } from ".";

export const init: Step<CheckPackageDependencyWorkflowContext> = {
    name: 'init',
    run: async (context: CheckPackageDependencyWorkflowContext): Promise<void> => {
        context.parsedInput.packageName = context.rawInput.trmPackage.packageName;
        context.parsedInput.print = !(context.rawInput.print ? true : false);
        context.parsedInput.systemPackages = context.rawInput.systemPackages || [];
        if(context.rawInput.trmPackage.manifest){
            const manifest = context.rawInput.trmPackage.manifest.get();
            context.parsedInput.dependencies = manifest.dependencies || [];
        }else{
            context.parsedInput.dependencies = [];
        }
        context.output = {
            dependencies: context.parsedInput.dependencies
        };
    }
}