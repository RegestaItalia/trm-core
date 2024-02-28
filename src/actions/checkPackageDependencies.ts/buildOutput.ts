import { Step } from "@sammarks/workflow";
import { FindDependenciesPublishWorkflowContext } from ".";

export const buildOutput: Step<FindDependenciesPublishWorkflowContext> = {
    name: 'build-output',
    filter: async (context: FindDependenciesPublishWorkflowContext): Promise<boolean> => {
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
    run: async (context: FindDependenciesPublishWorkflowContext): Promise<void> => {
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