import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { checkServerAuth, workflowCallbacks } from "..";
import { upload } from "./upload";
import { R3transOptions } from "node-r3trans";
import { TRKORR } from "../../client";

/**
 * Input data for cg3z action.
 */
export interface Cg3zActionInput {
    /**
    * Set r3trans options.
    */
    r3transOptions?: R3transOptions;

    /**
    * Zip file containing header and data files.
    */
    binaries: Buffer
}

type WorkflowRuntime = {}

export type Cg3zActionOutput = {
    /**
    * Transport number uploaded.
    */
    trkorr: TRKORR
}

export interface Cg3zWorkflowContext {
    rawInput: Cg3zActionInput,
    runtime?: WorkflowRuntime,
    output?: Cg3zActionOutput
};

const WORKFLOW_NAME = 'cg3z';

/**
 * Upload a transport (as a zip file)
*/
export async function cg3z(inputData: Cg3zActionInput): Promise<Cg3zActionOutput> {
    const workflow = [
        checkServerAuth,
        upload
    ];
    const result = await execute<Cg3zWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return {
        trkorr: result.output.trkorr
    }
}
