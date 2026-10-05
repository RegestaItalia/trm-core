import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { eq } from "semver";
import { Lock, Lockfile } from "../../lockfile";
import { TrmPackage } from "../../trmPackage";
import { getInstalledDependency } from "../commons/utils";

function findLock(lockfile: Lockfile, trmPackage: TrmPackage, versionRange: string): Lock | undefined {
    try {
        return lockfile.getLock(trmPackage, versionRange);
    } catch {
        return undefined;
    }
}

/**
 * Workflow step that compares the dependency installed on the system with the requested range.
 * A compatible installed release is kept and the dependency install becomes a no-op, unless a
 * lockfile pins the dependency to a different version.
 *
 * 1- find installed release
 *
 * 2- keep compatible installed release
 *
*/
export const checkInstalledRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'check-installed-release',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        //1- find installed release
        const dependencyName = context.rawInput.dependencyDataPackage.name;
        const versionRange = context.rawInput.dependencyDataPackage.versionRange;
        const installed = getInstalledDependency(context.rawInput.contextData.systemPackages, context.runtime.trmPackage, versionRange);
        if (installed.status === 'manifestUnreadable') {
            throw new Error(`Cannot verify installed dependency "${dependencyName}": package is installed but its manifest is unreadable.`);
        }
        context.runtime.installedVersion = installed.installedVersion;

        //2- keep compatible installed release
        if (installed.status !== 'ok') {
            return;
        }
        const lockfile = context.rawInput.installData.checks.lockfile;
        const lock = lockfile ? findLock(lockfile, context.runtime.trmPackage, versionRange) : undefined;
        if (lock && !eq(lock.version, installed.installedVersion)) {
            Logger.info(`Dependency "${dependencyName}" v${installed.installedVersion} installed, lockfile requires v${lock.version}.`);
            return;
        }
        context.runtime.alreadyInstalled = true;
        Logger.info(`Dependency "${dependencyName}" v${installed.installedVersion} already installed (${versionRange}).`);
    }
}
