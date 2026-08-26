import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { FileSystem, PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
import { Manifest } from "../../manifest";
import { TrmTransportIdentifier } from "../../transport";

/**
 * Update package data
 * 
 * Creates/update record in TRM packages table
 * 
 * 1- commit new values
 * 
*/
export const updatePackageData: Step<InstallWorkflowContext> = {
    name: 'update-package-data',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Update package data step', true);

        Logger.loading(`Finalizing install...`);

        //1- commit new values
        const originalTransport = context.runtime.transports.tadir.binaries.trkorr;
        const installTransport = context.output.transport?.trkorr;
        const devclass = context.rawInput.installData.installDevclass.keepOriginal ?
            context.runtime.package.hierarchy.devclass :
            context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === context.runtime.package.hierarchy.devclass).installDevclass;
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