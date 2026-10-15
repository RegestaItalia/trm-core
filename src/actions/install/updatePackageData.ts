import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallPackageReplacements, InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { installRegistryKey } from "../commons/utils";
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

function installDevcRows(packageName: string, packageRegistry: string, replacements: InstallPackageReplacements[]): ZTRM_INSTALLDEVC[] {
    return replacements.map(replacement => ({
        package_name: packageName,
        package_registry: packageRegistry,
        original_devclass: replacement.originalDevclass,
        install_devclass: replacement.installDevclass
    }));
}

/**
 * Records the installed release: TRM packages table row, install packages and install transports.
 * A trm-server/trm-rest upgrade also records it right after its import, which is never rolled back.
 */
export async function recordInstalledRelease(context: InstallWorkflowContext): Promise<void> {
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
    const packageRegistry = installRegistryKey(context.runtime.installRegistry);

    const installDevc = installDevcRows(context.rawInput.packageData.name, packageRegistry, context.rawInput.installData.installDevclass.replacements);
    // Only transports imported on this system: uninstall and update delete their customizing.
    // An upgrade that kept the installed customizing still owns the rows of the previous transports.
    const importedCust = (context.runtime.transports.cust || [])
        .filter(cust => cust.instance)
        .map(cust => ({ trkorr: cust.instance.trkorr, trmType: TrmTransportIdentifier.CUST }));
    // Installed customizing transports that still own rows: all of them without customizing import,
    // otherwise those with rows kept by the upgrade cleanup (declined, or shipped by skipped transports).
    const previousCust = (context.runtime.previousInstallTransports || [])
        .filter(o => (o.trmType || '').trim().toUpperCase() === TrmTransportIdentifier.CUST && !importedCust.some(k => k.trkorr === o.trkorr));
    const retainedCust = context.rawInput.installData.import?.noCust
        ? previousCust
        : previousCust.filter(o => (context.runtime.cleanupPlan?.retainedCustomizingSources || []).includes(o.trkorr));
    const keptCust = context.runtime.update
        ? retainedCust.map(o => ({ trkorr: o.trkorr, trmType: TrmTransportIdentifier.CUST }))
        : [];
    const installTr = installTransportRows(context.rawInput.packageData.name, packageRegistry, [
        ...keptCust,
        ...importedCust,
        ...(context.runtime.transports.lang?.instance
            ? [{ trkorr: context.runtime.transports.lang.instance.trkorr, trmType: TrmTransportIdentifier.LANG }]
            : [])
    ]);
    context.revert.metadataPackageRegistry = packageRegistry;
    // A trm-server/trm-rest upgrade is not rolled back after its import: nothing to restore
    if (context.runtime.update && !context.runtime.selfUpdate) {
        // The installed packages may have been read without their rows: read the stored row
        // before writing, so the revert restores it exactly, or removes the row it wrote.
        // A failed read aborts before any write.
        context.revert.metadataPreviousPackageRow = await SystemConnector.getTrmPackageData(context.runtime.package.data.manifest.name, packageRegistry);
        context.revert.metadataPreviousPackageRead = true;
    }
    context.revert.metadataPackageRow = {
        package_name: context.runtime.package.data.manifest.name,
        package_registry: packageRegistry,
        manifest: Buffer.from(new Manifest(context.runtime.package.data.manifest).getAbapXml(), 'utf8'),
        trkorr: installTransport || originalTransport,
        integrity: context.runtime.package.data.checksum,
        devclass
    };
    // Mappings stored for devclasses that are no longer installed: the write only upserts.
    const staleInstallDevc = installDevcRows(context.rawInput.packageData.name, packageRegistry,
        context.runtime.previousInstallPackages.filter(previous => !installDevc.some(o => o.original_devclass === previous.originalDevclass)));
    context.revert.metadataInstallDevc = installDevc;
    // Mark before the mutating await: SAP may commit the mapping and still
    // fail while returning the response.
    context.revert.metadataWriteStarted = true;
    await SystemConnector.setInstallDevc(installDevc);
    // A legacy backend has neither API: trm-server and trm-rest have no stale mappings nor install transports
    if (!context.legacyBackend) {
        if (staleInstallDevc.length > 0) {
            await SystemConnector.deleteInstallDevc(staleInstallDevc);
        }
        context.revert.metadataTransportsWriteStarted = true;
        await SystemConnector.setInstallTransports(context.rawInput.packageData.name, packageRegistry, installTr);
    }
    await SystemConnector.updateTrmPackageData(context.revert.metadataPackageRow);
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
        await recordInstalledRelease(context);
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        // First installs remove the newly written row through the same atomic SAP operation.
        if (!context.revert.metadataWriteStarted) {
            return;
        }
        if (context.runtime.selfUpdate) {
            // The imported release stays installed (see import-batch): its record is kept
            Logger.log(`Keeping the TRM data of the imported ${context.rawInput.packageData.name}`, true);
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
        if (!context.revert.metadataPreviousPackageRead) {
            return;
        }
        // One atomic SAP operation restores the row read before writing (or deletes the row this
        // install wrote when none was stored) and replaces the mappings and install transports.
        const previousRow = context.revert.metadataPreviousPackageRow;
        const packageRow = previousRow || context.revert.metadataPackageRow;
        await SystemConnector.restoreInstallMetadata({
            package: packageRow,
            packageExists: !!previousRow,
            installDevc: installDevcRows(context.rawInput.packageData.name, packageRow.package_registry, context.runtime.previousInstallPackages),
            installTr: installTransportRows(context.rawInput.packageData.name, packageRow.package_registry, context.runtime.previousInstallTransports || [])
        });
    }
}
