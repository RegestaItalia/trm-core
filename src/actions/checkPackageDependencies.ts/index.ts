import execute from "@sammarks/workflow";
import { TrmPackage } from "../../trmPackage";
import { Logger } from "../../logger";
import { inspect } from "util";
import { TrmManifestDependency } from "../../manifest";
import { LogTableStruct } from "../../commons";
import { init } from "./init";
import { setSystemPackages } from "./setSystemPackages";
import { analizeDependencies } from "./analizeDependencies";
import { buildOutput } from "./buildOutput";

export type CheckPackageDependencyActionInput = {
    trmPackage: TrmPackage,
    print: boolean,
    systemPackages?: TrmPackage[]
}

type WorkflowParsedInput = {
    print?: boolean,
    packageName?: string,
    dependencies?: TrmManifestDependency[],
    systemPackages?: TrmPackage[]
}

type WorkflowRuntime = {
    table?: LogTableStruct,
    versionOkDependencies?: TrmManifestDependency[],
    versionKoDependencies?: TrmManifestDependency[],
    integrityOkDependencies?: TrmManifestDependency[],
    integrityKoDependencies?: TrmManifestDependency[]
}

export type CheckPackageDependencyActionOutput = {
    dependencies?: TrmManifestDependency[],
    dependencyStatus?: {
        dependency: TrmManifestDependency,
        match: boolean,
        safe: boolean
    }[]
}

export type FindDependenciesPublishWorkflowContext = {
    rawInput: CheckPackageDependencyActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output: CheckPackageDependencyActionOutput
};

const WORKFLOW_NAME = 'check-package-dependencies';

export async function checkPackageDependencies(inputData: CheckPackageDependencyActionInput): Promise<CheckPackageDependencyActionOutput> {
    const workflow = [
        init,
        setSystemPackages,
        analizeDependencies,
        buildOutput
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<FindDependenciesPublishWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {},
        output: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    const output = result.output;
    return output;
}