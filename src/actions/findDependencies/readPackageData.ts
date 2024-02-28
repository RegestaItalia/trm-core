import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const readPackageData: Step<WorkflowContext> = {
    name: 'read-package-data',
    run: async (context: WorkflowContext): Promise<void> => {
        const devclass = context.parsedInput.devclass;
        Logger.loading(`Reading package data...`);
        context.runtime.devclassIgnore = [devclass].concat((await SystemConnector.getSubpackages(devclass)).map(o => o.devclass));
    }
}