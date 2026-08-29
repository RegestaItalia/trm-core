import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { FileSystem, PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
import { Manifest } from "../../manifest";

/**
 * Workflow step that records the installed release in the target system's TRM package table.
 * 
 * Creates/update record in TRM packages table
 * 
 * 1- commit new values
 * 
*/
export const updatePackageData: Step<InstallWorkflowContext> = {
    name: 'update-package-data',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.loading(`Finalizing install...`);

        //1- commit new values
        const originalTransport = context.runtime.transports.tadir.binaries.trkorr;
        const installTransport = context.output.transport?.trkorr;
        const originalDevclass = context.runtime.package.hierarchy.devclass;
        let devclass = originalDevclass;
        if (!context.rawInput.installData.installDevclass.keepOriginal) {
            const rootReplacement = context.rawInput.installData.installDevclass.replacements.find(
                o => o.originalDevclass === originalDevclass
            );
            if (!rootReplacement?.installDevclass) {
                throw new Error(`Missing install devclass replacement for root package "${originalDevclass}".`);
            }
            devclass = rootReplacement.installDevclass;
        }
        var packageRegistry;
        switch (context.rawInput.packageData.registry.getRegistryType()) {
            case RegistryType.PUBLIC:
                packageRegistry = PUBLIC_RESERVED_KEYWORD;
                break;
            case RegistryType.PRIVATE:
                packageRegistry = context.rawInput.packageData.registry.endpoint;
                break;
            case RegistryType.LOCAL:
                const realRegistry = await (context.rawInput.packageData.registry as FileSystem).getRealRegistry();
                packageRegistry = realRegistry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : realRegistry.endpoint;
                break;
            default:
                packageRegistry = PUBLIC_RESERVED_KEYWORD;
                break;
        }
        await SystemConnector.updateTrmPackageData({
            package_name: context.runtime.package.data.manifest.name,
            package_registry: packageRegistry,
            manifest: Buffer.from(new Manifest(context.runtime.package.data.manifest).getAbapXml(), 'utf8'),
            trkorr: installTransport || originalTransport,
            integrity: context.runtime.package.data.checksum,
            devclass
        });
    }
}
