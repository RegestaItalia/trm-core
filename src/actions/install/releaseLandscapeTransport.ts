import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { releaseLandscape, revertLandscapeRelease, withScopedPrefix } from "../commons/utils";

/**
 * Workflow step that releases the generated landscape transport, when present. It's the last step:
 * the release is installed and recorded on this system, and a failed release doesn't undo it, the
 * transport is left to release manually.
 *
 * The landscape transport carries the whole upgrade, its deletions included: nothing else is added to
 * the target import queue.
*/
export const releaseLandscapeTransport: Step<InstallWorkflowContext> = {
    name: 'release-install-transports',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.output.transport) {
            return true;
        } else {
            Logger.log(`Skipping release of landscape transport (transport was not generated)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Landscape) `, async () => {
            await releaseLandscape(context, context.output.transport, context.rawInput.installData.landscapeTransport.targetSystem,
                `${context.rawInput.packageData.name} ${context.runtime.package.data.manifest.version} is installed on`, context.rawInput.contextData.logTemporaryFolder);
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        // A parent install rolling back this dependency install
        await revertLandscapeRelease(context, context.output.transport, context.rawInput.installData.landscapeTransport.targetSystem);
    }
}
