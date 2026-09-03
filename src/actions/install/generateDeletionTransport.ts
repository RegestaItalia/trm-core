import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { releaseDeletionTransport, restoreTransport } from "../commons/utils";
import { RegistryDeletionTransportUnauthorizedError } from "../../registry";

/**
 * Workflow step that creates a transport for objects removed by an upgrade.
 * It's necessary when:
 *   - upgrading/downgrading a package: to ensure old entries are cleaned up
 *   - sap packages were changes after upgrade/downgrade: to ensure empty packages are cleaned up
 * For these reasons, it's not generated on first install.
 * 
*/
export const generateDeletionTransport: Step<InstallWorkflowContext> = {
    name: 'generate-deletion-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.isLocal) {
            Logger.log(`Skipping generate deletion transport (local registry)`, true);
            return false;
        } else if (context.runtime.update) {
            return true;
        } else {
            Logger.log(`Skipping generate deletion transport (first install?)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  Deletion) `;
        try {
            if (originalLPrefix) {
                Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
            } else {
                Logger.setPrefix(prefix);
            }
            if (originalIPrefix) {
                Inquirer.setPrefix(`${originalIPrefix}-> ${prefix}`);
            } else {
                Inquirer.setPrefix(prefix);
            }
            //1- generate dummy transport
            Logger.loading(`Generating transport...`);
            const dummy = await Transport.createToc({
                text: `@X1@TRM (DELE) ${context.rawInput.packageData.name} ${context.runtime.package.data.manifest.version}`,
                target: SystemConnector.getDest()
            });
            if (context.runtime.update) {
                //TODO: this works only partially for temporary packages: a transportable package has in getTransport the landscape transport
                //which includes sap packages, workbench and eventual language and customizing entries
                //for temporary packages, however, this is just the workbench transport
                if (context.runtime.update.getTransport()) {
                    //TODO: this may add namespace to deletion, which may conflict with the previous addNamespace step
                    //maybe even blindly deleting it afterwards from deletion transport might be enough
                    await dummy.addObjectsFromTransport(context.runtime.update.getTransport().trkorr);
                }
            }
            //if sap packages changes...
            //TODO: we should make an example to understand how to catch this and handle it

            try {
                await releaseDeletionTransport(dummy, context.rawInput.packageData.registry, context);
            } catch (e) {
                if (!(e instanceof RegistryDeletionTransportUnauthorizedError)) {
                    throw e;
                }

                Logger.warning(`User is not authorized to generate cleanup transports. Manual cleanup of previous release install might be necessary.`);
            }
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.revert.dele) {
            await restoreTransport(context.revert.dele);
        }
    }
}
