import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { FileSystem, PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
import { Manifest } from "../../manifest";
import { ZTRM_INSTALLDEVC, ZTRM_INSTALLTR } from "../../client";
import { TrmTransportIdentifier } from "../../transport";

function installTransportRows(packageName: string, packageRegistry: string, transports: { trkorr: string, trmType: string }[]): ZTRM_INSTALLTR[] {
    return transports.map(transport => ({
        package_name: packageName,
        package_registry: packageRegistry,
        trkorr: transport.trkorr,
        trm_type: transport.trmType
    }));
}

/**
 * Workflow step that records the installed release in the target system's TRM package table.
 * 
 * Creates/update record in TRM packages table, with its install packages and the
 * customizing and translation transports imported on this system
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
        // Only transports imported on this system: uninstall and update delete their customizing.
        const installTr = installTransportRows(context.rawInput.packageData.name, packageRegistry, [
            ...(context.runtime.transports.cust || [])
                .filter(cust => cust.instance)
                .map(cust => ({ trkorr: cust.instance.trkorr, trmType: TrmTransportIdentifier.CUST })),
            ...(context.runtime.transports.lang?.instance
                ? [{ trkorr: context.runtime.transports.lang.instance.trkorr, trmType: TrmTransportIdentifier.LANG }]
                : [])
        ]);
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
        context.revert.metadataTransportsWriteStarted = true;
        await SystemConnector.setInstallTransports(context.rawInput.packageData.name, packageRegistry, installTr);
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
                    installDevc: [],
                    installTr: []
                });
            }
            return;
        }
        const previousInstallTransports = context.runtime.previousInstallTransports || [];
        if (context.runtime.previousInstallPackages.length === 0 && !context.revert.metadataPreviousPackageRow
            && !context.revert.metadataTransportsWriteStarted) {
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
        const previousInstallTr = installTransportRows(context.rawInput.packageData.name, packageRegistry, previousInstallTransports);
        if (context.revert.metadataPreviousPackageRow) {
            await SystemConnector.restoreInstallMetadata({
                package: context.revert.metadataPreviousPackageRow,
                packageExists: true,
                installDevc: previousInstallDevc,
                installTr: previousInstallTr
            });
            return;
        }
        // Without a snapshot the two writes are restored separately: attempt both.
        let firstError: unknown;
        if (previousInstallDevc.length > 0) {
            try {
                await SystemConnector.setInstallDevc(previousInstallDevc);
            } catch (error) {
                firstError = error;
            }
        }
        if (context.revert.metadataTransportsWriteStarted) {
            try {
                await SystemConnector.setInstallTransports(context.rawInput.packageData.name, packageRegistry, previousInstallTr);
            } catch (error) {
                firstError ||= error;
            }
        }
        if (firstError) {
            throw firstError;
        }
    }
}
