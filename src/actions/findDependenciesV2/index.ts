import execute from "@sammarks/workflow";
import { DEVCLASS, SENVI, TADIR } from "../../client";
import { TrmPackage } from "../../trmPackage";
import { Logger } from "../../logger";
import { inspect } from "util";
import { init } from "./init";
import { setSystemPackages } from "./setSystemPackages";
import { readPackageData } from "./readPackageData";
import { readPackageObjects } from "./readPackageObjects";
import { readRepositoryEnvironment } from "./readRepositoryEnvironment";
import { parseSenvi } from "./parseSenvi";
import { setTrmDependencies } from "./setTrmDependencies";

export type TadirObjectSenvi = {
    tadir: TADIR,
    senvi: SENVI[]
};

export type TableDependency = {
    dependencyIn: TADIR,
    tableDependency: any
};

export type SapEntriesDependency = {
    table: string,
    dependencies: TableDependency[]
};

export type TrmDependency = {
    devclass: DEVCLASS,
    trmPackage?: TrmPackage,
    integrity?: string,
    sapEntries: SapEntriesDependency[]
}

export type FindDependencyActionInput = {
    devclass: DEVCLASS,
    tadir?: TADIR[],
    deepCheck?: boolean,
    systemPackages?: TrmPackage[],
    print?: boolean
}

type WorkflowParsedInput = {
    devclass?: DEVCLASS,
    tadir?: TADIR[],
    deepCheck?: boolean,
    systemPackages?: TrmPackage[],
    print?: boolean
}

type WorkflowRuntime = {
    devclassIgnore?: DEVCLASS[],
    objectsSenvi?: TadirObjectSenvi[],
    parsedSenvi?: SapEntriesDependency[]
}

export type FindDependencyActionOutput = {
    sapEntries?: SapEntriesDependency[],
    trmDependencies?: TrmDependency[],
    unknownDependencies?: TrmDependency[]
}

export type FindDependenciesWorkflowContext = {
    rawInput: FindDependencyActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output: FindDependencyActionOutput
};

const WORKFLOW_NAME = 'find-dependencies';

export async function findDependencies(inputData: FindDependencyActionInput): Promise<FindDependencyActionOutput> {
    const workflow = [
        init,
        setSystemPackages,
        readPackageData,
        readPackageObjects,
        readRepositoryEnvironment,
        parseSenvi,
        setTrmDependencies
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<FindDependenciesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {},
        output: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    return result.output;
}