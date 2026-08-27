import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { init } from "./init";
import { analyze } from "./analyze";
import { TrmManifest } from "../../manifest";
import { workflowCallbacks } from "../commons";

/** Input used to verify a manifest's required SAP table entries. */
export interface CheckSapEntriesActionInput {
    /**
     * Data related to the package being checked.
     */
    packageData: {
        /**
         * Manifest whose `sapEntries` map will be checked against the connected system.
         */
        manifest: TrmManifest;
    };
    
    /**
     * Print options.
     */
    printOptions?: {
        /**
         * Print tables containing each required entry and its status. Defaults to `false`.
         */
        entriesStatus?: boolean;

        /**
         * Print informational summary messages. Defaults to `false`.
         */
        information?: boolean;
    }
}

type WorkflowRuntime = {
    entriesStatus: {
        good: {
            table: string,
            tableEntry: any
        }[],
        bad: {
            table: string,
            tableEntry: any
        }[]
    },
    missingTables: string[]
}

/** Status map keyed by SAP table name. */
export type SapEntriesStatus = {
    [key: string]: {
        /** Whether the required row exists in the target table. */
        status: boolean;
        /** Field/value object used to identify the required row. */
        entry: any
    }[];
};

/** SAP-entry report returned by {@link checkSapEntries}. */
export type CheckSapEntriesActionOutput = {
    /** Required entries copied from `manifest.sapEntries`, keyed by table name. */
    sapEntries: any,
    /** Existence result for each required entry, keyed by table name. */
    sapEntriesStatus: SapEntriesStatus
}

/** Internal state shared by the SAP-entry-check workflow steps. */
export interface CheckSapEntriesWorkflowContext {
    /** Original action input. */
    rawInput: CheckSapEntriesActionInput,
    /** Intermediate entry classifications and missing table names. */
    runtime?: WorkflowRuntime,
    /** Report assembled by the workflow. */
    output?: CheckSapEntriesActionOutput
};

const WORKFLOW_NAME = 'check-sap-entries';

/**
 * Checks whether the connected SAP system contains the table rows required by a manifest.
 *
 * Missing tables and rows are represented with failed statuses in the returned report.
 *
 * @param inputData Manifest and optional print settings.
 * @returns The required SAP entries and an existence result for each one.
 * @throws When the connected system cannot be queried for reasons other than a missing table or row.
 */
export async function checkSapEntries(inputData: CheckSapEntriesActionInput): Promise<CheckSapEntriesActionOutput> {
    const workflow = [
        init,
        analyze
    ];
    const result = await execute<CheckSapEntriesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return result.output;
}
