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
        const oArtifact = await trmPackage.fetchRemoteArtifact(packageVersion);
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
        context.runtime.trmPackage = trmPackage;
        context.runtime.trmArtifact = oArtifact;
        context.runtime.workbenchObjects = [];
        context.runtime.trCopy = [];
        
        context.parsedInput.skipAlreadyInstalledCheck = true;
        context.parsedInput.checkSapEntries = true;
        context.parsedInput.installIntegrity = context.rawInput.integrity;
        context.parsedInput.r3transOptions = context.rawInput.r3transOptions;
        context.parsedInput.checkObjectTypes = true;
        context.parsedInput.keepOriginalPackages = true;
        context.parsedInput.transportLayer = context.rawInput.transportLayer;
        context.parsedInput.importTimeout = 180;
        context.parsedInput.skipWbTransportGen = false;
    }
}