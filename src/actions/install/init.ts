import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { parsePackageName } from "../../commons";
import { createHash } from "crypto";

export const init: Step<InstallWorkflowContext> = {
    name: 'init',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var packageName = context.rawInput.packageName;
        var packageVersion = context.rawInput.version || 'latest';
        const registry = context.rawInput.registry;

        //check package name doesn't throw error
        packageName = parsePackageName({
            fullName: packageName
        }).fullName;

        if (packageVersion.trim().toLowerCase() === 'latest') {
            packageVersion = 'latest';
        }

        Logger.loading(`Searching TRM package in registry ${registry.name}...`);
        const trmPackage = new TrmPackage(packageName, registry);
        const oArtifact = await trmPackage.fetchRemoteArtifact(packageVersion);
        const installIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
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
        context.runtime.fetchedIntegrity = installIntegrity;
        
        context.parsedInput.packageName = packageName;
        context.parsedInput.version = trmManifest.version;
        context.parsedInput.safeInstall = context.rawInput.safeInstall ? true : false;
        context.parsedInput.noInquirer = context.rawInput.silent ? true : false;
        context.parsedInput.forceDevclassInput = context.rawInput.silent ? false : true;
        if(context.rawInput.force){
            context.parsedInput.skipAlreadyInstalledCheck = true;
            context.parsedInput.checkSapEntries = false;
            context.parsedInput.checkObjectTypes = false;
            context.parsedInput.forceInstallSameVersion = true;
            context.parsedInput.overwriteInstall = true;
            context.parsedInput.checkDependencies = false;
        }else{
            context.parsedInput.skipAlreadyInstalledCheck = false;
            context.parsedInput.checkSapEntries = context.rawInput.skipSapEntriesCheck ? false : true;
            context.parsedInput.checkObjectTypes = context.rawInput.skipObjectTypesCheck ? false : true;
            context.parsedInput.forceInstallSameVersion = false;
            context.parsedInput.overwriteInstall = context.rawInput.allowReplace ? true : false;
            context.parsedInput.checkDependencies = context.rawInput.ignoreDependencies ? false : true;
        }
        context.parsedInput.keepOriginalPackages = context.rawInput.keepOriginalDevclass ? true : false;
        context.parsedInput.installMissingDependencies = context.rawInput.ignoreDependencies ? false : true;
        //TODO -> check transport layer exists
        context.parsedInput.transportLayer = context.rawInput.transportLayer;
        //TODO -> check target system exists
        context.parsedInput.wbTrTargetSystem = context.rawInput.wbTrTargetSystem;
        context.parsedInput.installIntegrity = context.rawInput.integrity;
        context.parsedInput.r3transOptions = context.rawInput.r3transOptions;
        context.parsedInput.importTimeout = context.rawInput.importTimeout || 180;
        context.parsedInput.skipWbTransportGen = context.rawInput.generateTransport ? false : true;
        context.parsedInput.packageReplacements = context.rawInput.packageReplacements || [];
    }
}