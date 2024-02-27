import execute from "@sammarks/workflow";
import { DEVCLASS, TADIR, TR_TARGET } from "../../client";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { Registry } from "../../registry";
import { init } from "./init";
import { setDevclass } from "./setDevclass";
import { checkPublishAllowed } from "./checkPublishAllowed";
import { setTransportTarget } from "./setTransportTarget";
import { setDevclassObjs } from "./setDevclassObjs";
import { findDependencies } from "./findDependencies";

export type PublishActionInput = {
    package: TrmManifest, //atleast name and version
    devclass?: DEVCLASS,
    registry: Registry,
    target?: TR_TARGET,
    ci?: boolean,
    skipDependencies?: boolean,
    forceManifestInput?: boolean,
    overwriteManifestValues?: boolean,
    skipEditSapEntries?: boolean,
    skipEditDependencies?: boolean,
    skipReadme?: boolean,
    skipLang?: boolean,
    readme?: string,
    releaseTimeout?: number,
    tmpFolder?: string
}

type WorkflowParsedInput = {
    packageName: string,
    version: string,
    devclass: string,
    trTarget: string
}

type WorkflowRuntime = {
    registry: Registry,
    tadirObjects: TADIR[],
    packageDependencies: TrmManifestDependency[]
}

export type WorkflowContext = {
    rawInput: PublishActionInput,
    parsedInput?: WorkflowParsedInput,
    runtime?: WorkflowRuntime
};

export async function publish(inputData: PublishActionInput): Promise<void> {
    const workflow = [
        init,
        checkPublishAllowed,
        setDevclass,
        setTransportTarget,
        setDevclassObjs,
        findDependencies
    ];
    await execute<WorkflowContext>('publish', workflow, { rawInput: inputData })
}