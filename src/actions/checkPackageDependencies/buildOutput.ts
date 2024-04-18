import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependencyWorkflowContext } from ".";

export const buildOutput: Step<CheckPackageDependencyWorkflowContext> = {
    name: 'build-output',
    filter: async (context: CheckPackageDependencyWorkflowContext): Promise<boolean> => {
        try {
            const items = context.runtime.versionOkDependencies.length +
                context.runtime.versionKoDependencies.length +
                context.runtime.integrityOkDependencies.length +
                context.runtime.integrityKoDependencies.length;
            return items > 0;
        } catch (e) {
            return false;
        }
    },
    run: async (context: CheckPackageDependencyWorkflowContext): Promise<void> => {
        context.output.dependencyStatus = [];
        context.runtime.versionOkDependencies.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].match = true;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: true,
                    safe: null
                });
            }
        });
        context.runtime.versionKoDependencies.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].match = false;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: false,
                    safe: null
                });
            }
        });
        context.runtime.integrityOkDependencies.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].safe = true;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: null,
                    safe: true
                });
            }
        });
        context.runtime.integrityKoDependencies.forEach(o => {
            const i = context.output.dependencyStatus.findIndex(k => k.dependency.name === o.name && k.dependency.registry === o.registry);
            if (i >= 0) {
                context.output.dependencyStatus[i].safe = false;
            } else {
                context.output.dependencyStatus.push({
                    dependency: o,
                    match: null,
                    safe: false
                });
            }
        });
    }
}