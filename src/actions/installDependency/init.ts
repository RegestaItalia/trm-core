import { Step } from "@sammarks/workflow";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { parsePackageName } from "../../commons";
import { InstallDependencyWorkflowContext } from ".";
import { validRange } from "semver";

export const init: Step<InstallDependencyWorkflowContext> = {
    name: 'init',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        var packageName = context.rawInput.packageName;
        var versionRange = context.rawInput.versionRange;
        const registry = context.rawInput.registry;

        //check package name doesn't throw error
        packageName = parsePackageName({
            fullName: packageName
        }).fullName;

        versionRange = validRange(versionRange);

        if (!versionRange) {
            throw new Error(`Dependency "${packageName}", invalid version range.`);
        }

        context.parsedInput.packageName = packageName;
        context.parsedInput.versionRange = versionRange;
        context.parsedInput.forceInstall = context.rawInput.forceInstall ? true : false;
        context.parsedInput.integrity = context.rawInput.integrity;

        context.runtime.registry = registry;
    }
}