import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { createHash } from "crypto";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

/**
 * Workflow step that records the published release in the origin system's TRM package table.
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
            const packageName = context.rawInput.packageData.name;
            const packageVersion = context.runtime.manifest.version;
            Logger.error(`An error occurred during publish finalize. ${packageName} v${packageVersion} has been published, however package on ${SystemConnector.getDest()} is inconsistent.`);
            Logger.error(`Install ${packageName} v${packageVersion} on ${SystemConnector.getDest()} to synchronize its package data.`);
            Logger.error(String(e), true);
        }
    }
}
