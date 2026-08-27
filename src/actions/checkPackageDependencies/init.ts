import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependenciesWorkflowContext } from ".";
import { PUBLIC_RESERVED_KEYWORD } from "../../registry";

/**
 * Workflow step that initializes dependency-check output and normalizes optional input.
 * 
 * 1- set dependencies (read manifest)
 * 
*/
export const init: Step<CheckPackageDependenciesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckPackageDependenciesWorkflowContext): Promise<void> => {
        context.output = {
            dependencies: [],
            dependencyStatus: []
        };
        context.runtime = {
            dependenciesStatus: {
                goodVersion: [],
                badVersion: []
            }
        };

        //1- set dependencies
        context.output.dependencies = context.rawInput.packageData.manifest.dependencies || [];
        const dependencyKeys = new Set<string>();
        for (const dependency of context.output.dependencies) {
            const registry = dependency.registry || PUBLIC_RESERVED_KEYWORD;
            const key = `${dependency.name}\u0000${registry}`;
            if (dependencyKeys.has(key)) {
                throw new Error(`Duplicate dependency "${dependency.name}" for registry "${registry}".`);
            }
            dependencyKeys.add(key);
        }

        //2- fill missing input data
        if(!context.rawInput.printOptions){
            context.rawInput.printOptions = {};
        }
        if(!context.rawInput.contextData){
            context.rawInput.contextData = {};
        }
    }
}
