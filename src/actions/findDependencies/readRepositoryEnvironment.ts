import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { SENVI, TADIR } from "../../client";
import { Logger } from "../../logger";

export const readRepositoryEnvironment: Step<FindDependenciesWorkflowContext> = {
    name: 'read-repository-environment',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var aSenvi: {
            tadir: TADIR,
            senvi: SENVI[]
        }[] = [];
        const tadir = context.parsedInput.tadir;
        Logger.loading(`Reading objects...`);
        for (const tadirObj of tadir) {
            const senvi = await SystemConnector.repositoryEnvironment(tadirObj.object, tadirObj.objName);
            aSenvi.push({
                tadir: tadirObj,
                senvi
            });
        }
        context.runtime.senvi = aSenvi;
    }
}