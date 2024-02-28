import { Step } from "@sammarks/workflow";
import { FindDependenciesPublishWorkflowContext } from ".";

export const init: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'init',
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        context.parsedInput.packageName = context.rawInput.trmPackage.packageName;
        context.parsedInput.print = !(context.rawInput.print ? true : false);
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