import execute, { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { init as setTadirObjs } from "../findTadirDependencies/init";

import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setDevclassObjs: Step<WorkflowContext> = {
    name: 'set-devclass-objs',
    run: async (context: WorkflowContext): Promise<void> => {
        const devclass = context.parsedInput.devclass;
        await execute<WorkflowContext>('publish', workflow, { rawInput: inputData })
    }
}