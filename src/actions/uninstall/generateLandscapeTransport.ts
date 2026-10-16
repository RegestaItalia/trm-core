import { Step } from "@simonegaffurini/sammarksworkflow";
import { UninstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { trmTransportDescription } from "../../transport/TransportDescription";
import { releaseLandscape, revertLandscapeRelease, withScopedPrefix } from "../commons/utils";

/**
 * Workflow step that creates the landscape transport of an uninstall: a copy of the imported deletion
 * transports (of the TRM packages installed underneath too). The objects are no longer on this system:
 * its release exports them as deletions, so the following systems get the same cleanup.
 */
export const generateLandscapeTransport: Step<UninstallWorkflowContext> = {
    name: 'generate-landscape-transport',
    filter: async (context: UninstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.nested) {
            Logger.log(`Skipping landscape transport (carried by the uninstall of the parent package)`, true);
            return false;
        } else if (!context.rawInput.uninstallData.landscapeTransport.targetSystem) {
            Logger.log(`Skipping landscape transport (system has no transport targets or package is temporary)`, true);
            return false;
        } else if ((context.output.deletions || []).length === 0) {
            Logger.log(`Skipping landscape transport (nothing was deleted)`, true);
            return false;
        }
        return true;
    },
    run: async (context: UninstallWorkflowContext): Promise<void> => {
        const manifest = context.runtime.update.manifest.get();
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Landscape) `, async () => {
            Logger.loading(`Generating landscape transport...`);
            context.output.landscapeTransport = await Transport.createWb({
                text: trmTransportDescription(manifest.name, manifest.version, 'DELE'),
                target: context.rawInput.uninstallData.landscapeTransport.targetSystem
            });
            for (const deletion of context.output.deletions) {
                Logger.loading(`Including deletions from transport ${deletion.trkorr}...`, true);
                await context.output.landscapeTransport.addObjectsFromTransport(deletion.trkorr);
            }
            await context.output.landscapeTransport.removeComments();
            await context.output.landscapeTransport.addComment(`name=${manifest.name}`);
            await context.output.landscapeTransport.addComment(`version=${manifest.version}`);
        });
    },
    revert: async (context: UninstallWorkflowContext): Promise<void> => {
        if (context.output.landscapeTransport && await context.output.landscapeTransport.canBeDeleted()) {
            await context.output.landscapeTransport.delete();
            context.output.landscapeTransport = undefined;
        }
    }
}

/**
 * Workflow step that releases the landscape transport of an uninstall, last: the package is already
 * uninstalled from this system, a failed release only leaves the transport to release manually.
 */
export const releaseLandscapeTransport: Step<UninstallWorkflowContext> = {
    name: 'release-landscape-transport',
    filter: async (context: UninstallWorkflowContext): Promise<boolean> => !!context.output.landscapeTransport,
    run: async (context: UninstallWorkflowContext): Promise<void> => {
        const targetSystem = context.rawInput.uninstallData.landscapeTransport.targetSystem;
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Landscape) `, async () => {
            await releaseLandscape(context, context.output.landscapeTransport, targetSystem,
                `${context.rawInput.packageData.name} is uninstalled from`);
            context.output.targetSystem = targetSystem;
        });
    },
    revert: async (context: UninstallWorkflowContext): Promise<void> => {
        await revertLandscapeRelease(context, context.output.landscapeTransport, context.rawInput.uninstallData.landscapeTransport.targetSystem);
        context.output.targetSystem = undefined;
    }
}
