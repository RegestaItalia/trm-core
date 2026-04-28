import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
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
        const originalTransport = context.runtime.packageTransports.tadir.binaries.trkorr;
        const installTransport = context.runtime.installData.transports.find(o => o.type === TrmTransportIdentifier.TADIR);
        const devclass = context.rawInput.installData.installDevclass.keepOriginal ? 
            context.runtime.originalData.hierarchy.devclass : 
            context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass = context.runtime.originalData.hierarchy.devclass).installDevclass;
        await SystemConnector.updateTrmPackageData({
            package_name: context.rawInput.packageData.name,
            package_registry: context.runtime.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : context.runtime.registry.endpoint,
            manifest: Buffer.from(new Manifest(context.runtime.remotePackageData.manifest).getAbapXml(), 'utf8'),
            trkorr: installTransport && installTransport.transport ? installTransport.transport.trkorr : originalTransport,
            integrity: context.runtime.remotePackageData.data.checksum,
            devclass
        });
    }
}