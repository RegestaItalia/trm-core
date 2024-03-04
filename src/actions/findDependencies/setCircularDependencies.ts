import { Step } from "@sammarks/workflow";
import { FindDependenciesPublishWorkflowContext } from ".";
import { validateDevclass } from "../../inquirer";
import { Logger } from "../../logger";

export const setCircularDependencies: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'set-circular-dependencies',
    filter: async (context: FindDependenciesPublishWorkflowContext): Promise<boolean> => {
        const trmDependencies = (context.output.dependencies || []).filter(o => o.trmPackage);
        if(trmDependencies.length > 0){
            return true;
        }else{
            Logger.log(`Skipping circular dependencies check beacuse no TRM packages were found`, true);
            return false;
        }
    },
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
        const trmDependencies = (context.output.dependencies || []).filter(o => o.trmPackage);
        for(const trmDependency of trmDependencies){
            const linkedPackage = trmDependency.trmPackage;
            const packageManifest = linkedPackage.manifest;
            if(packageManifest){
                const packageDependencies = packageManifest.get().dependencies || [];
                
            }
        }
    }
}