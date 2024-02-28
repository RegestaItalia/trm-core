import execute from "@sammarks/workflow";
import { DEVCLASS, SENVI, TADIR } from "../../client";
import { init } from "./init";
import { readPackageData } from "./readPackageData";
import { readPackageObjects } from "./readPackageObjects";
import { readRepositoryEnvironment } from "./readRepositoryEnvironment";
import { setTadirDependencies } from "./setTadirDependencies";
import { TrmPackage } from "../../trmPackage";
import { setDependencies } from "./setDependencies";
import { Logger } from "../../logger";
import { inspect } from "util";

export type FindDependencyActionInput = {
    devclass: DEVCLASS,
    tadir?: TADIR[]
}

export type TadirDependency = {
    trmPackage?: TrmPackage,
    isSap: boolean,
    integrity?: string,
    tadir: TADIR[]
}

type WorkflowParsedInput = {
    devclass?: DEVCLASS,
    tadir?: TADIR[]
}

type WorkflowRuntime = {
    devclassIgnore?: DEVCLASS[],
    senvi?: SENVI[],
    tadirDependencies?: TADIR[]
}

export type FindDependencyActionOutput = {
    dependencies?: TadirDependency[]
}

export type FindDependenciesPublishWorkflowContext = {
    rawInput: FindDependencyActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output: FindDependencyActionOutput
};

const WORKFLOW_NAME = 'find-dependencies';

export async function findDependencies(inputData: FindDependencyActionInput): Promise<FindDependencyActionOutput> {
    const workflow = [
        init,
        readPackageData,
        readPackageObjects,
        readRepositoryEnvironment,
        setTadirDependencies,
        setDependencies
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<FindDependenciesPublishWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {},
        output: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    var output = result.output;
    if(!output.dependencies){
        output.dependencies = [];
    }
    return output;
}