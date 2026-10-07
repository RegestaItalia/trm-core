import { checkServerAuth, executeWorkflow, workflowCallbacks } from "..";
import { parseTransportArchive, upload } from "./upload";
import { ActionLockScope, withActionLockScope } from "../commons/utils";
import { TRKORR } from "../../client";
import { Transport } from "../../transport";

/** Shared execution settings for the CG3Z action. */
export type Cg3zActionInputContextData = {
    /**
     * Disable interactive prompts. Any required choice without an explicit value then causes an error.
     */
    noInquirer?: boolean;
}

/** Options controlling the transport upload. */
export type Cg3zActionInputUploadData = {
    /**
     * Whether to overwrite a transport that already exists in the target system (E070 entry,
     * header or data file). `true` overwrites and `false` aborts. When omitted, the user is asked;
     * with `noInquirer` the upload is aborted.
     */
    overwrite?: boolean;
}

/** Input required to upload a transport to the connected SAP system. */
export interface Cg3zActionInput {
    /** Optional shared execution settings. */
    contextData?: Cg3zActionInputContextData,

    /** Optional upload settings. */
    uploadData?: Cg3zActionInputUploadData,

    /**
    * ZIP archive containing exactly one matching `K` header file and `R` data file.
    */
    binaries: Buffer
}

type WorkflowRuntime = {
    /** Uploaded transport tracked before file writes so failures can be rolled back. */
    transport?: Transport,
    /** State of an existing transport that is being overwritten, restored on rollback. */
    overwritten?: {
        /** The transport already had an E070 entry: rollback must never delete it. */
        e070: boolean,
        /** Previous header (cofile) content. */
        header?: Buffer,
        /** Previous data file content. */
        data?: Buffer
    }
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
 * Uploads and forwards one SAP transport from an in-memory ZIP archive. When an existing transport
 * is overwritten, its TMS text is refreshed too.
 *
 * @param inputData Transport archive and optional upload settings.
 * @returns The uploaded transport request number.
 * @throws When authorization fails, the archive is malformed, the header/data files do
 * not identify the same transport, the transport already exists and overwriting is refused
 * (or cannot be confirmed with `noInquirer`), or the upload/forward operation fails. A transport-text
 * refresh failure (overwrite only) is logged as a warning and does not reject the action.
 */
export async function cg3z(inputData: Cg3zActionInput): Promise<Cg3zActionOutput> {
    const trkorr = parseTransportArchive(inputData.binaries).trkorr;
    const lockScope = new ActionLockScope(WORKFLOW_NAME);
    await lockScope.acquire([{ type: "TRANSPORT", name: trkorr }]);
    const workflow = [
        checkServerAuth,
        upload
    ];
    inputData.contextData ??= {};
    inputData.uploadData ??= {};
    return withActionLockScope(lockScope, async () => {
        const result = await executeWorkflow<Cg3zWorkflowContext>(WORKFLOW_NAME, workflow, {
            rawInput: inputData,
            runtime: {}
        }, workflowCallbacks);
        return { trkorr: result.output.trkorr };
    });
}
