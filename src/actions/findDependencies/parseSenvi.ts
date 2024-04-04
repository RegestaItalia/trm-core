import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { SenviParser } from "../../dependency";

export const parseSenvi: Step<FindDependenciesWorkflowContext> = {
    name: 'parse-senvi',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        const aSenvi = context.runtime.senvi;
        const aIgnoredDevclass = context.runtime.devclassIgnore;
        const senviParser = new SenviParser();
        
        context.runtime.tadirDependencies = [];
        context.runtime.tfdirDependencies = [];

        for (const oSenvi of aSenvi) {
            for(const senvi of oSenvi.senvi){
                const tadirDependency = await senviParser.parse(senvi);
                if (tadirDependency) {
                    if (!context.runtime.tadirDependencies.find(o => o.tadir.pgmid === tadirDependency.pgmid &&
                        o.tadir.object === tadirDependency.object &&
                        o.tadir.objName === tadirDependency.objName)) {
                            context.runtime.tadirDependencies.push({
                            tadir: tadirDependency,
                            dependencyIn: oSenvi.tadir
                        });
                    }
                    if(tadirDependency.subObject){
                        if(tadirDependency.subObject.func){
                            if(!context.runtime.tfdirDependencies.find(o => o.tfdir.funcname === tadirDependency.subObject.func)){
                                context.runtime.tfdirDependencies.push({
                                    dependencyIn: oSenvi.tadir,
                                    tfdir: {
                                        funcname: tadirDependency.subObject.func,
                                        pname: `SAPL${tadirDependency.objName}`
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }

        //remove object in current devclass and subpackages
        context.runtime.tadirDependencies = context.runtime.tadirDependencies.filter(o => !aIgnoredDevclass.includes(o.tadir.devclass));
        
        //remove function modules without fugr
        context.runtime.tfdirDependencies = context.runtime.tfdirDependencies.filter(o => {
            return context.runtime.tadirDependencies.find(k => k.tadir.pgmid === 'R3TR' &&
                                                               k.tadir.object === 'FUGR' &&
                                                               k.tadir.objName === o.tfdir.pname.replace(/^SAPL/gmi, '')) ? true : false;
        });
    }
}