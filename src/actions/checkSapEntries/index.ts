import execute from "@sammarks/workflow";
import { TrmPackage } from "../../trmPackage";
import { Logger } from "../../logger";
import { inspect } from "util";
import { LogTableStruct } from "../../commons";
import { init } from "./init";
import { analizeSapEntries } from "./analizeSapEntries";
import { buildOutput } from "./buildOutput";

export type CheckSapEntriesActionInput = {
    trmPackage: TrmPackage,
    print: boolean
}

type WorkflowParsedInput = {
    packageName?: string,
    sapEntries?: any,
    print?: boolean
}

type WorkflowRuntime = {
    tables?: LogTableStruct[],
    okEntries?: any,
    koEntries?: any
}

export type CheckSapEntriesActionOutput = {
    sapEntries?: any,
    sapEntriesStatus?: any,
    unknownTables?: string[]
}

export type CheckSapEntriesWorkflowContext = {
    rawInput: CheckSapEntriesActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output: CheckSapEntriesActionOutput
};

const WORKFLOW_NAME = 'check-sap-entries';

export async function checkSapEntries(inputData: CheckSapEntriesActionInput): Promise<CheckSapEntriesActionOutput> {
    const workflow = [
        init,
        analizeSapEntries,
        buildOutput
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<CheckSapEntriesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {},
        output: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    const output = result.output;
    return output;
}