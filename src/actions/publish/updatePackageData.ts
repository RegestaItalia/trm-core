import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { createHash } from "crypto";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

/**
 * Update package data
 * 
 * Creates/update record in TRM packages table
 * 
 * 1- commit new values
 * 
*/
export const updatePackageData: Step<PublishWorkflowContext> = {
    name: 'update-package-data',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Update package data step', true);
        try {
            Logger.loading(`Finalizing publish...`);

            //1- commit new values
            const integrity = createHash("sha512").update(context.runtime.trmPackage.artifact.binary).digest("base64");
            await SystemConnector.updateTrmPackageData({
                package_name: context.rawInput.packageData.name,
                package_registry: context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : context.rawInput.packageData.registry.endpoint,
                manifest: Buffer.from(context.runtime.trmPackage.manifestXml, 'utf8'),
                trkorr: context.runtime.systemData.tadirTransport.trkorr,
                integrity: integrity,
                devclass: context.rawInput.packageData.devclass
            });
        } catch (e) {
            Logger.error(`An error occurred during publish finalize. The package has been published, however TRM on ${SystemConnector.getDest()} migh be inconsistent.`);
            Logger.error(e.toString(), true);
        }
    }
}