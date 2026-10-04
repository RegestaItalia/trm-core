import { Step } from "@simonegaffurini/sammarksworkflow";
import { DeleteWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { cleanupInstalledPackage, releaseDeletionTransport, revertInstalledPackageCleanup } from "../commons/utils";

/**
 * Deletes the staging packages created by the cleanup, once their objects were assigned back.
 * Every package is attempted; the first failure is thrown afterwards.
 */
async function deleteStagingPackages(context: DeleteWorkflowContext): Promise<void> {
    let firstError: unknown;
    for (const devclass of context.revert.sapPackages) {
        try {
            if (!(await SystemConnector.getDevclass(devclass))) {
                continue;
            }
            const objects = (await SystemConnector.getDevclassObjects(devclass, false)).filter(object =>
                !(object.pgmid.trim().toUpperCase() === 'R3TR' && object.object.trim().toUpperCase() === 'DEVC'));
            if (objects.length > 0) {
                throw new Error(`SAP package ${devclass} still contains ${objects.length} objects: manual cleanup is necessary.`);
            }
            Logger.loading(`Deleting package ${devclass}...`, true);
            const transport = await Transport.createToc({
                text: `@X1@TRM (DELE) ${context.rawInput.packageData.name} ${context.runtime.update.manifest.get().version}`,
                target: SystemConnector.getDest()
            });
            try {
                await transport.addObjects([{ pgmid: 'R3TR', object: 'DEVC', objName: devclass }], false);
                await releaseDeletionTransport(transport, context.rawInput.packageData.registry, context, false);
            } catch (error) {
                try {
                    if (await transport.canBeDeleted()) {
                        await transport.delete();
                    }
                } catch (deleteError) {
                    Logger.warning(`Could not delete transport ${transport.trkorr}: ${String(deleteError)}`);
                }
                throw error;
            }
        } catch (error) {
            Logger.warning(`Could not delete SAP package ${devclass}, manual cleanup might be necessary.`);
            firstError ||= error;
        }
    }
    if (firstError) {
        throw firstError;
    }
}

/**
 * Workflow step that removes every object of the installed release through a deletion transport.
 * 
 * It's the same cleanup performed by install when upgrading a package (see `generateUpdateTransport`),
 * where nothing is kept because there's no incoming release.
 * 
*/
export const generateDeletionTransport: Step<DeleteWorkflowContext> = {
    name: 'generate-deletion-transport',
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('delete');
        }
        await cleanupInstalledPackage(context, {
            incomingObjects: [],
            keptDevclasses: [],
            prefix: `(${Transport.getTransportIcon()}  Delete) `,
            actionName: 'Delete',
            requireDeletion: true
        });
        context.output.transport = context.runtime.dele;
    },
    revert: async (context: DeleteWorkflowContext): Promise<void> => {
        // Objects might still be assigned to a staging package if restoring failed:
        // only delete staging packages after a complete restore.
        await revertInstalledPackageCleanup(context);
        await deleteStagingPackages(context);
    }
}
