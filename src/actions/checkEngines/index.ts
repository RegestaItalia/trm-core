import { init } from "./init";
import { analyze } from "./analyze";
import { TrmManifest, TrmManifestEngines } from "../../manifest";
import { executeWorkflow, workflowCallbacks } from "../commons";
import { CVERS, PRDVERS } from "../../client/struct";
import { TrmPackage } from "../../trmPackage";

/** Input used to verify a manifest's engines (TRM, SAP release/components, products, notes, tables). */
export interface CheckEnginesActionInput {
    /**
     * Data related to the running environment.
     */
    contextData?: {
        /**
         * Version of trm-core in use, checked against `engines.trm.trm-core`.
         * Supply it when the client resolves trm-core itself; defaults to the version read from trm-core package.json.
         */
        coreVersion?: string;
    };

    /**
     * Data related to the package being checked.
     */
    packageData: {
        /**
         * Manifest whose `engines` declaration will be checked against the connected system.
         */
        manifest: TrmManifest;
    };

    /**
     * Print options.
     */
    printOptions?: {
        /**
         * Print a table containing each requirement and its status. Defaults to `false`.
         */
        enginesStatus?: boolean;

        /**
         * Print informational summary messages. Defaults to `false`.
         */
        information?: boolean;
    }
}

/** Result of a single engines requirement. */
export type EngineCheckResult = {
    /** Path of the requirement in the engines declaration, e.g. `components.SAP_BASIS` or `anyOf[1].notes.1234567`. */
    path: string,
    /** Human readable requirement, e.g. `release >=750, sp >=5`. */
    requirement: string,
    /** Human readable value found on the system, when available. */
    actual?: string,
    /** Whether the requirement is satisfied. */
    ok: boolean,
    /** Whether this requirement must be satisfied on its own (`false` for requirements nested in `anyOf` alternatives). */
    required: boolean,
    /** Explanation when the requirement couldn't be verified. */
    reason?: string
}

/** Engines report returned by {@link checkEngines}. */
export type CheckEnginesActionOutput = {
    /** Normalized engines declaration copied from `manifest.engines`. */
    engines: TrmManifestEngines,
    /** Whether all engines requirements are satisfied. */
    passed: boolean,
    /** Result of each requirement. */
    results: EngineCheckResult[]
}

type WorkflowRuntime = {
    trmServer?: Promise<TrmPackage>,
    components?: Promise<CVERS[]>,
    products?: Promise<PRDVERS[]>
}

/** Internal state shared by the engines-check workflow steps. */
export interface CheckEnginesWorkflowContext {
    /** Original action input. */
    rawInput: CheckEnginesActionInput,
    /** System data read once and reused across requirements. */
    runtime?: WorkflowRuntime,
    /** Report assembled by the workflow. */
    output?: CheckEnginesActionOutput
};

const WORKFLOW_NAME = 'check-engines';

/**
 * Checks whether the connected SAP system satisfies the engines declared by a manifest.
 *
 * Unmet or unverifiable requirements (e.g. unreadable tables, unsupported engine checks) are reported as failed.
 *
 * @param inputData Manifest and optional print settings.
 * @returns The normalized engines and the result of each requirement.
 * @throws When the engines declaration is malformed.
 */
export async function checkEngines(inputData: CheckEnginesActionInput): Promise<CheckEnginesActionOutput> {
    const workflow = [
        init,
        analyze
    ];
    const result = await executeWorkflow<CheckEnginesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return result.output;
}
