import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { TrmPackage } from "../../trmPackage";
import { init } from "./init";
import { analyze } from "./analyze";

/**
 * Input data for check SAP Entries action.
 */
export interface CheckSapEntriesActionInput {
    /**
     * Data related to the package being checked.
     */
    packageData: {
        /**
         * TRM Package instance.
         */
        package: TrmPackage;
    };
    
    /**
     * Print options.
     */
    printOptions?: {
        /**
         * Print entries status.
         */
        entriesStatus?: boolean;

        /**
         * Print information data.
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

export type SapEntriesStatus = {
    [key: string]: {
        status: boolean;
        entry: any
    }[];
};

export type CheckSapEntriesActionOutput = {
    sapEntries: any,
    sapEntriesStatus: SapEntriesStatus
}

export interface CheckSapEntriesWorkflowContext {
    rawInput: CheckSapEntriesActionInput,
    runtime?: WorkflowRuntime,
    output?: CheckSapEntriesActionOutput
};

const WORKFLOW_NAME = 'check-sap-entries';

/**
 * Check TRM Package SAP entries status
*/
export async function checkSapEntries(inputData: CheckSapEntriesActionInput): Promise<CheckSapEntriesActionOutput> {
    const workflow = [
        init,
        analyze
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<CheckSapEntriesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    return result.output;
}