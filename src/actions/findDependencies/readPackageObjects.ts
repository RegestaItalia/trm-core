import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const readPackageObjects: Step<FindDependenciesWorkflowContext> = {
    name: 'read-package-objects',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        const devclass = context.parsedInput.devclass;
        var tadirObjects = context.rawInput.tadir || [];
        if (tadirObjects.length === 0) {
            Logger.loading(`Reading package objects...`);
            tadirObjects = await SystemConnector.getDevclassObjects(devclass, true);
        }
        context.parsedInput.tadir = tadirObjects;
    }
}