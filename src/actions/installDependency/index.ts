import execute from "@simonegaffurini/sammarksworkflow";
import { Logger, inspect } from "../../logger";
import { Registry } from "../../registry";
import { Release } from "trm-registry-types";
import { TrmPackage } from "../../trmPackage";
import { init } from "./init";
import { getRangeReleases } from "./getRangeReleases";
import { setSystemPackages } from "./setSystemPackages";
import { checkAlreadyInstalled } from "./checkAlreadyInstalled";
import { findInstallRelease } from "./findInstallRelease";
import { InstallActionInput, InstallActionOutput } from "../install";
import { installRelease } from "./installRelease";

export type InstallDependencyActionInput = {
    packageName: string,
    versionRange: string,
    registry: Registry,
    installOptions: InstallActionInput,
    forceInstall?: boolean,
    integrity?: string,
    systemPackages?: TrmPackage[]
}

type WorkflowParsedInput = {
    packageName?: string,
    versionRange?: string,
    forceInstall?: boolean,
    installOptions?: InstallActionInput,
    integrity?: string,
    systemPackages?: TrmPackage[]
}

type WorkflowRuntime = {
    registry?: Registry,
    releases?: Release[],
    releasePackages?: TrmPackage[],
    skipInstall?: boolean
}

export type InstallDependencyActionOutput = {
    version?: string,
    installOutput?: InstallActionOutput
}

export type InstallDependencyWorkflowContext = {
    rawInput: InstallDependencyActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output?: InstallDependencyActionOutput
};

const WORKFLOW_NAME = 'install-dependency';

export async function installDependency(inputData: InstallDependencyActionInput): Promise<InstallDependencyActionOutput> {
    const workflow = [
        init,
        getRangeReleases,
        setSystemPackages,
        checkAlreadyInstalled,
        findInstallRelease,
        installRelease
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<InstallDependencyWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    /*const trmPackage = result.runtime.trmPackage;
    const registry = result.runtime.registry;
    const wbTransport = result.runtime.wbTransport;
    return {
        trmPackage,
        registry,
        wbTransport
    }*/
    return {};
}