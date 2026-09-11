import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { FileSystem, PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
import { Manifest } from "../../manifest";
import { ZTRM_INSTALLDEVC } from "../../client";

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
        Logger.loading(`Updating TRM data...`);
        const originalTransport = context.runtime.transports.tadir.instance.trkorr;
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
        let packageRegistry;
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

        const installDevc: ZTRM_INSTALLDEVC[] = [];
        context.rawInput.installData.installDevclass.replacements.forEach(o => {
            installDevc.push({
                package_name: context.rawInput.packageData.name,
                package_registry: packageRegistry,
                original_devclass: o.originalDevclass,
                install_devclass: o.installDevclass
            });
        });
        context.revert.metadataPackageRegistry = packageRegistry;
        if (context.runtime.update && typeof context.runtime.update.getMetadataSnapshot === 'function') {
            context.revert.metadataPreviousPackageRow = context.runtime.update.getMetadataSnapshot();
        }
        context.revert.metadataPackageRow = {
            package_name: context.runtime.package.data.manifest.name,
            package_registry: packageRegistry,
            manifest: Buffer.from(new Manifest(context.runtime.package.data.manifest).getAbapXml(), 'utf8'),
            trkorr: installTransport || originalTransport,
            integrity: context.runtime.package.data.checksum,
            devclass
        };
        // Mark before the mutating await: SAP may commit the mapping and still
        // fail while returning the response.
        context.revert.metadataWriteStarted = true;
        await SystemConnector.setInstallDevc(installDevc);
        await SystemConnector.updateTrmPackageData(context.revert.metadataPackageRow);
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        // Restore the exact persisted row when available; first installs remove
        // the newly written row through the same atomic SAP operation.
        if (!context.revert.metadataWriteStarted) {
            return;
        }
        if (!context.runtime.update) {
            if (context.revert.metadataPackageRow) {
                await SystemConnector.restoreInstallMetadata({
                    package: context.revert.metadataPackageRow,
                    packageExists: false,
                    installDevc: []
                });
            }
            return;
        }
        if (context.runtime.previousInstallPackages.length === 0 && !context.revert.metadataPreviousPackageRow) {
            return;
        }
        const packageRegistry = context.revert.metadataPreviousPackageRow?.package_registry
            || context.revert.metadataPackageRegistry;
        if (!packageRegistry) {
            return;
        }
        const previousInstallDevc = context.runtime.previousInstallPackages.map(replacement => ({
            package_name: context.rawInput.packageData.name,
            package_registry: packageRegistry,
            original_devclass: replacement.originalDevclass,
            install_devclass: replacement.installDevclass
        }));
        if (context.revert.metadataPreviousPackageRow) {
            await SystemConnector.restoreInstallMetadata({
                package: context.revert.metadataPreviousPackageRow,
                packageExists: true,
                installDevc: previousInstallDevc
            });
            return;
        }
        await SystemConnector.setInstallDevc(previousInstallDevc);
    }
}
