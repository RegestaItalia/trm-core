import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { TADIR } from "../../client";
import { SenviParser } from "../../dependency";

export const setTadirDependencies: Step<WorkflowContext> = {
    name: 'set-tadir-dependencies',
    run: async (context: WorkflowContext): Promise<void> => {
        var tadirDependencies: TADIR[] = [];
        const aSenvi = context.runtime.senvi;
        const aIgnoredDevclass = context.runtime.devclassIgnore;
        const senviParser = new SenviParser();
        
        for (const senvi of aSenvi) {
            const tadirDependency = await senviParser.parse(senvi);
            if (tadirDependency) {
                if (!tadirDependencies.find(o => o.pgmid === tadirDependency.pgmid &&
                    o.object === tadirDependency.object &&
                    o.objName === tadirDependency.objName)) {
                    tadirDependencies.push(tadirDependency);
                }
            }
        }

        //remove object in current devclass and subpackages
        context.runtime.tadirDependencies = tadirDependencies.filter(o => !aIgnoredDevclass.includes(o.devclass));
    }
}