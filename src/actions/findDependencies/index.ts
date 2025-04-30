import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { TrmPackage } from "../../trmPackage";
import { IActionContext } from "..";
import { DEVCLASS, SENVI, TADIR } from "../../client";
import { init } from "./init";
import { setObjects } from "./setObjects";
import { readRepositoryEnvironment } from "./readRepositoryEnvironment";
import { parseSenvi } from "./parseSenvi";
import { setTrmDependencies } from "./setTrmDependencies";
import { print } from "./print";

/**
 * Input data for find dependencies action.
 */
export interface FindDependenciesActionInput {
    /**
     * Optional context data.
     */
    contextData?: {
        /**
         * Use inquirer? (will force some decisions).
         */
        noInquirer?: boolean;
    };

    /**
     * Data related to the package being analyzed.
     */
    packageData: {

        /**
         * ABAP package name.
         */
        package: DEVCLASS;

        /**
         * Package objects.
         */
        objects?: TADIR[];
    };
    
    /**
     * Print options.
     */
    printOptions?: {
        /**
         * Print TRM dependencies.
         */
        trmDependencies?: boolean;

        /**
         * Print SAP objects dependencies.
         */
        sapObjectDependencies?: boolean;
    }
}

type ObjectSenvi = {
    tadir: TADIR,
    senvi: SENVI[]
}

export type TableDependency = {
    foundIn: TADIR,
    object: any
};

export type SapEntriesDependency = {
    table: string,
    dependencies: TableDependency[]
};

export type TrmDependency = {
    devclass: DEVCLASS,
    package: TrmPackage,
    integrity?: string,
    sapEntries: SapEntriesDependency[]
};

type WorkflowRuntime = {
    abort: boolean,
    packageData: {
        ignoredTadir: TADIR[]
    },
    repositoryEnvironment: {
        senvi: ObjectSenvi[]
    },
    dependencies: {
        customObjects: SapEntriesDependency[],
        sapObjects: SapEntriesDependency[],
        withTrmPackage: TrmDependency[],
        withoutTrmPackage: TrmDependency[]
    }
}
export type FindDependenciesActionOutput = {
    trmPackageDependencies: {
        withTrmPackage: TrmDependency[],
        withoutTrmPackage: TrmDependency[]
    },
    objectDependencies: {
        customObjects: SapEntriesDependency[],
        sapObjects: SapEntriesDependency[]
    }
}

export interface FindDependenciesWorkflowContext extends IActionContext {
    rawInput: FindDependenciesActionInput,
    runtime?: WorkflowRuntime,
    output?: FindDependenciesActionOutput
};

const WORKFLOW_NAME = 'find-dependencies';

/**
 * Find ABAP package dependencies with other ABAP packages/TRM packages
*/
export async function findDependencies(inputData: FindDependenciesActionInput): Promise<FindDependenciesActionOutput> {
    const workflow = [
        init,
        setObjects,
        readRepositoryEnvironment,
        parseSenvi,
        setTrmDependencies,
        print
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<FindDependenciesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    return {
        trmPackageDependencies: {
            withTrmPackage: result.runtime.dependencies.withTrmPackage,
            withoutTrmPackage: result.runtime.dependencies.withoutTrmPackage,
        },
        objectDependencies: {
            customObjects: result.runtime.dependencies.customObjects,
            sapObjects: result.runtime.dependencies.sapObjects
        }
    }
}