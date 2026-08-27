import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { checkServerAuth, workflowCallbacks } from "..";
import { upload } from "./upload";
import { R3transOptions } from "node-r3trans";
import { TRKORR } from "../../client";

/** Input required to upload a transport to the connected SAP system. */
export interface Cg3zActionInput {
    /**
    * Optional `R3trans` settings forwarded to compatible transport operations.
    *
    * The current upload workflow accepts this value for API compatibility but does not
    * read it directly.
    */
    r3transOptions?: R3transOptions;

    /**
    * ZIP archive containing exactly one matching `K` header file and `R` data file.
    */
    binaries: Buffer
}

type WorkflowRuntime = {}

/** Result of a successful {@link cg3z} upload. */
export type Cg3zActionOutput = {
    /**
    * Transport request number derived from the uploaded file names.
    */
    trkorr: TRKORR
}

/** Internal workflow state used by the CG3Z action steps. */
export interface Cg3zWorkflowContext {
    /** Original action input. */
    rawInput: Cg3zActionInput,
    /** Reserved runtime state for workflow steps. */
    runtime?: WorkflowRuntime,
    /** Upload result, populated after the archive has been validated. */
    output?: Cg3zActionOutput
};

const WORKFLOW_NAME = 'cg3z';

/**
 * Uploads, forwards, and refreshes one SAP transport from an in-memory ZIP archive.
 *
 * @param inputData Transport archive and optional upload settings.
 * @returns The uploaded transport request number.
 * @throws When authorization fails, the archive is malformed, the header/data files do
 * not identify the same transport, or the upload/forward operation fails. A transport-text
 * refresh failure is logged as a warning and does not reject the action.
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
