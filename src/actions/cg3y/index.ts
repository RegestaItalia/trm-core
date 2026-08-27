import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { checkServerAuth, workflowCallbacks } from "..";
import { TRKORR } from "../../client";
import { download } from "./download";

/** Input required to export a transport from the connected SAP system. */
export interface Cg3yActionInput {
    /**
    * Released SAP transport request number to export, for example `DEVK900123`.
    */
    trkorr: TRKORR
}

type WorkflowRuntime = {}

/** Result of a successful {@link cg3y} export. */
export type Cg3yActionOutput = {
    /**
    * ZIP archive containing the transport's `K` header file and `R` data file.
    */
    binaries: Buffer
}

/** Internal workflow state used by the CG3Y action steps. */
export interface Cg3yWorkflowContext {
    /** Original action input. */
    rawInput: Cg3yActionInput,
    /** Reserved runtime state for workflow steps. */
    runtime?: WorkflowRuntime,
    /** Export result, populated by the download step. */
    output?: Cg3yActionOutput
};

const WORKFLOW_NAME = 'cg3y';

/**
 * Exports a released SAP transport as an in-memory ZIP archive.
 *
 * The connected user is authorized first, then the action verifies that the transport
 * exists and is released before downloading its header and data files.
 *
 * @param inputData Transport export request.
 * @returns A ZIP archive containing one matching transport header/data pair.
 * @throws When authorization fails, the transport does not exist, is not released, or cannot be downloaded.
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
