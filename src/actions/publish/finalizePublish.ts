import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { CliLogFileLogger, CliLogger, Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { createHash } from "crypto";
import { RegistryType } from "../../registry";

export const finalizePublish: Step<WorkflowContext> = {
    name: 'finalize-publish',
    run: async (context: WorkflowContext): Promise<void> => {
        Logger.loading(`Finalizing...`);
        try {
            //add to publish trkorr
            await SystemConnector.addSrcTrkorr(context.runtime.tadirTransport.trkorr);
            context.runtime.tryTadirDeleteRevert = true;
            //generate integrity
            const integrity = createHash("sha512").update(context.runtime.artifact.binary).digest("hex");
            await SystemConnector.setPackageIntegrity({
                package_name: context.parsedInput.packageName,
                package_registry: context.runtime.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : context.runtime.registry.endpoint,
                integrity
            });
        } catch (e) {
            Logger.error(e.toString(), true);
            Logger.error(`An error occurred during publish finalize. The package has been published, however TRM is inconsistent.`);
        }
        if (process.env.TRM_ENV === 'DEV') {
            throw new Error(`Running in development, rolling back publish`);
        }
    }
}