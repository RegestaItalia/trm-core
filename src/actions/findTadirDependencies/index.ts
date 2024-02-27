import execute from "@sammarks/workflow";
import { DEVCLASS, TADIR } from "../../client";

export type FindDependencyActionInput = {
    devclass: DEVCLASS,
    tadir?: TADIR[]
}

type WorkflowParsedInput = {
    devclass: DEVCLASS,
    tadir: TADIR[]
}

type WorkflowRuntime = {

}

export type WorkflowContext = {
    rawInput: FindDependencyActionInput,
    parsedInput?: WorkflowParsedInput,
    runtime?: WorkflowRuntime
};

export async function findDependency(inputData: FindDependencyActionInput): Promise<void> {
    const workflow = [
        
    ];
    await execute<WorkflowContext>('find-dependency', workflow, { rawInput: inputData })
}