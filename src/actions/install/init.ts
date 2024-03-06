import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { parsePackageName } from "../../commons";

export const init: Step<InstallWorkflowContext> = {
    name: 'init',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var packageName = context.rawInput.packageName;
        var packageVersion = context.rawInput.version || 'latest';
        const registry = context.rawInput.registry;

        //check package name doesn't throw error
        parsePackageName({
            fullName: packageName
        });

        if (packageVersion.trim().toLowerCase() === 'latest') {
            packageVersion = 'latest';
        }

        Logger.loading(`Searching TRM package in registry ${registry.name}...`);
        const trmPackage = new TrmPackage(packageName, registry);
        const oManifest = await trmPackage.fetchRemoteManifest(packageVersion);
        const trmManifest = oManifest.get();
        var sVersion = trmManifest.version;
        if (packageVersion === 'latest') {
            sVersion = `latest -> ${trmManifest.version}`;
        }
        Logger.info(`"${trmManifest.name}" version ${sVersion} found in registry ${registry.name}`);

        context.runtime.registry = registry;
        context.runtime.manifest = oManifest;
        context.runtime.trmManifest = trmManifest;

        context.parsedInput.skipAlreadyInstalledCheck = false;
    }
}