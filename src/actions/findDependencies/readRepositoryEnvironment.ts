import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { SENVI } from "../../client";
import { Logger } from "../../logger";

export const readRepositoryEnvironment: Step<WorkflowContext> = {
    name: 'read-repository-environment',
    run: async (context: WorkflowContext): Promise<void> => {
        var aSenvi: SENVI[] = [];
        const tadir = context.parsedInput.tadir;
        Logger.loading(`Reading objects...`);
        for (const tadirObj of tadir) {
            aSenvi = aSenvi.concat(await SystemConnector.repositoryEnvironment(tadirObj.object, tadirObj.objName));
        }
        context.runtime.senvi = aSenvi;
    }
}