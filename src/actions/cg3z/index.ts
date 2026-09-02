import execute from "@simonegaffurini/sammarksworkflow";
import { checkServerAuth, workflowCallbacks } from "..";
import { upload } from "./upload";
import { TRKORR } from "../../client";
import { Transport } from "../../transport";

/** Input required to upload a transport to the connected SAP system. */
export interface Cg3zActionInput {
    /**
    * ZIP archive containing exactly one matching `K` header file and `R` data file.
    */
    binaries: Buffer
}

type WorkflowRuntime = {
    /** Uploaded transport tracked before file writes so failures can be rolled back. */
    transport?: Transport
}

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
        rawInput: inputData,
        runtime: {}
    }, workflowCallbacks);
    return {
        trkorr: result.output.trkorr
    }
}
