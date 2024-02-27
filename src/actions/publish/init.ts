import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";

export const init: Step<WorkflowContext> = {
    name: 'init',
    run: async (context: WorkflowContext): Promise<void> => {
        var packageName: string;
        var packageVersion: string;
        const registry = context.rawInput.registry;
        try {
            packageName = context.rawInput.package.name.toLowerCase().trim();
        } catch (e) {
            throw new Error(`Missing package name.`);
        }
        try {
            packageVersion = context.rawInput.package.version;
        } catch (e) {
            throw new Error(`Missing package version.`);
        }
        if (!packageName) {
            throw new Error(`Package name empty.`);
        }
        if (!packageVersion) {
            throw new Error(`Package version empty.`);
        }
        Logger.loading(`Checking package`);
        context.parsedInput.packageName = packageName;
        context.parsedInput.version = await TrmPackage.normalizeVersion(packageName, packageVersion, registry);
        context.runtime.registry = registry;
    }
}