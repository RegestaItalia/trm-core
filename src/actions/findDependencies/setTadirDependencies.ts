import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { TADIR } from "../../client";
import { SenviParser } from "../../dependency";

export const setTadirDependencies: Step<FindDependenciesWorkflowContext> = {
    name: 'set-tadir-dependencies',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var tadirDependencies: {
            dependencyIn: TADIR
            tadir: TADIR
        }[] = [];
        const aSenvi = context.runtime.senvi;
        const aIgnoredDevclass = context.runtime.devclassIgnore;
        const senviParser = new SenviParser();
        
        for (const oSenvi of aSenvi) {
            for(const senvi of oSenvi.senvi){
                const tadirDependency = await senviParser.parse(senvi);
                if (tadirDependency) {
                    if (!tadirDependencies.find(o => o.tadir.pgmid === tadirDependency.pgmid &&
                        o.tadir.object === tadirDependency.object &&
                        o.tadir.objName === tadirDependency.objName)) {
                        tadirDependencies.push({
                            tadir: tadirDependency,
                            dependencyIn: oSenvi.tadir
                        });
                    }
                }
            }
        }

        //remove object in current devclass and subpackages
        context.runtime.tadirDependencies = tadirDependencies.filter(o => !aIgnoredDevclass.includes(o.tadir.devclass));
    }
}