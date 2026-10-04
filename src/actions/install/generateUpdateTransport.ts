import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { cleanupInstalledPackage, revertInstalledPackageCleanup } from "../commons/utils";
import { PackageHierarchy } from "../../commons";

export { deleteTemporaryCleanupPackages } from "../commons/utils";

function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [pkg.devclass, ...pkg.sub.flatMap(flattenDevclasses)];
}

/**
 * Workflow step that creates a transport for objects removed by an upgrade.
 * It's necessary when:
 *   - upgrading/downgrading a package: to ensure old entries are cleaned up
 *   - sap packages were changes after upgrade/downgrade: to ensure empty packages are cleaned up
 * For these reasons, it's not generated on first install.
 *
 * The cleanup itself is shared with the delete action, which removes the installed
 * release without an incoming one.
*/
export const generateUpdateTransport: Step<InstallWorkflowContext> = {
    name: 'generate-update-transport',
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
        // Read the target lazily: a failure reading the previous release must still be tracked first.
        const installDevclass = context.rawInput.installData?.installDevclass;
        await cleanupInstalledPackage(context, {
            get incomingObjects() {
                return context.runtime.transports.tadir.binaries.entries.tadir || [];
            },
            get keptDevclasses() {
                return installDevclass.keepOriginal
                    ? flattenDevclasses(context.runtime.package.hierarchy)
                    : installDevclass.replacements.map(replacement => replacement.installDevclass);
            },
            prefix: `(${Transport.getTransportIcon()}  Upgrade cleanup) `,
            actionName: 'Update',
            requireDeletion: false
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        await revertInstalledPackageCleanup(context);
    }
}
