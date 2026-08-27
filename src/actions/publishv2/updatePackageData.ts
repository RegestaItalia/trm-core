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
        try {
            Logger.loading(`Finalizing publish...`);

            //1- commit new values
            const integrity = createHash("sha512").update(context.output.trmArtifact.binary).digest("base64");
            await SystemConnector.updateTrmPackageData({
                package_name: context.rawInput.packageData.name,
                package_registry: context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : context.rawInput.packageData.registry.endpoint,
                manifest: Buffer.from(context.runtime.manifestXml, 'utf8'),
                trkorr: context.runtime.transports.tadir.trkorr,
                integrity: integrity,
                devclass: context.rawInput.packageData.devclass
            });
        } catch (e) {
            Logger.error(`An error occurred during publish finalize. The package has been published, however package on ${SystemConnector.getDest()} is inconsistent.`);
            Logger.error(`Consider running an install of the newly published package to fix inconsistency.`);
            Logger.error(e.toString(), true);
        }
    }
}