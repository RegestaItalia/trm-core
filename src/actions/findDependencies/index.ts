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
import { setSystemPackages } from "./setSystemPackages";
import { deepCheckDependencies } from "./deepCheckDependencies";

export type DependencyTreeBranch = {
    packageName: string,
    trmPackage: TrmPackage,
    dependencies: DependencyTreeBranch[],
    circular: boolean
};

export type DependencyTree = {
    devclass: string,
    dependencies: DependencyTreeBranch[]
};

export type FindDependencyActionInput = {
    devclass: DEVCLASS,
    tadir?: TADIR[],
    deepCheck?: boolean,
    systemPackages?: TrmPackage[]
}

export type TadirDependency = {
    trmPackage?: TrmPackage,
    isSap: boolean,
    integrity?: string,
    tadir: TADIR[],
    dependencyIn: TADIR[]
}

type WorkflowParsedInput = {
    devclass?: DEVCLASS,
    tadir?: TADIR[],
    deepCheck?: boolean,
    systemPackages?: TrmPackage[]
}

type WorkflowRuntime = {
    devclassIgnore?: DEVCLASS[],
    senvi?: {
        tadir: TADIR,
        senvi: SENVI[]
    }[],
    tadirDependencies?: {
        dependencyIn: TADIR
        tadir: TADIR
    }[],
    trmPackageDependencies?: TrmPackage[]
}

export type FindDependencyActionOutput = {
    dependencies?: TadirDependency[],
    tree?: DependencyTree
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
        setSystemPackages,
        readPackageData,
        readPackageObjects,
        readRepositoryEnvironment,
        setTadirDependencies,
        setDependencies,
        deepCheckDependencies
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