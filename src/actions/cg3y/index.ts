import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { checkServerAuth, workflowCallbacks } from "..";
import { TRKORR } from "../../client";
import { download } from "./download";

/**
 * Input data for cg3y action.
 */
export interface Cg3yActionInput {
    /**
    * Transport number to download.
    */
    trkorr: TRKORR
}

type WorkflowRuntime = {}

export type Cg3yActionOutput = {
    /**
    * Zip file containing header and data files.
    */
    binaries: Buffer
}

export interface Cg3yWorkflowContext {
    rawInput: Cg3yActionInput,
    runtime?: WorkflowRuntime,
    output?: Cg3yActionOutput
};

const WORKFLOW_NAME = 'cg3y';

/**
 * Download a released transport (as a zip file)
*/
export async function cg3y(inputData: Cg3yActionInput): Promise<Cg3yActionOutput> {
    const workflow = [
        checkServerAuth,
        download
    ];
    const result = await execute<Cg3yWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return {
        binaries: result.output.binaries
    }
}
