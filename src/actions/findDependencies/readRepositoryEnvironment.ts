import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext, TadirObjectSenvi } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const readRepositoryEnvironment: Step<FindDependenciesWorkflowContext> = {
    name: 'read-repository-environment',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var aSenvi: TadirObjectSenvi[] = [];
        var tadir = context.parsedInput.tadir;
        tadir = tadir.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
        Logger.loading(`Reading objects...`);
        for (const tadirObj of tadir) {
            const senvi = await SystemConnector.repositoryEnvironment(tadirObj.object, tadirObj.objName);
            aSenvi.push({
                tadir: tadirObj,
                senvi
            });
        }
        context.runtime.objectsSenvi = aSenvi;
    }
}