import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { releaseDeletionTransport, restoreTransport } from "../commons/utils";
import { RegistryDeletionTransportUnauthorizedError } from "../../registry";
import { PackageHierarchy } from "../../commons";
import { E071, TADIR } from "../../client";

function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [pkg.devclass, ...pkg.sub.flatMap(flattenDevclasses)];
}

function normalize(value: string): string {
    return value.trim().toUpperCase();
}

function objectKey(object: Pick<E071, 'pgmid' | 'object' | 'objName'>): string {
    return `${normalize(object.pgmid)}\u0000${normalize(object.object)}\u0000${normalize(object.objName)}`;
}

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
        const prefix = `(${Transport.getTransportIcon()}  Upgrade cleanup) `;
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
            const previousTransportObjects = context.runtime.update.getTransport()
                ? await context.runtime.update.getTransport().getE071()
                : [];
            const incomingObjects = context.runtime.transports.tadir.binaries.entries.tadir || [];
            const replacementDevclasses = new Map(
                context.rawInput.installData.installDevclass.replacements.map(replacement => [
                    normalize(replacement.originalDevclass),
                    replacement.installDevclass
                ])
            );
            const currentDevclasses = new Set(
                (context.rawInput.installData.installDevclass.keepOriginal
                    ? flattenDevclasses(context.runtime.package.hierarchy)
                    : context.rawInput.installData.installDevclass.replacements.map(replacement => replacement.installDevclass)
                ).map(normalize)
            );
            const previousDevclasses = new Map<string, string>();
            context.runtime.previousInstallPackages.forEach(replacement => {
                previousDevclasses.set(normalize(replacement.installDevclass), replacement.installDevclass);
            });
            // Older installations that kept the publisher package names have no replacement rows.
            if (previousDevclasses.size === 0 && context.runtime.update.getDevclass()) {
                const previousRoot = context.runtime.update.getDevclass();
                previousDevclasses.set(normalize(previousRoot), previousRoot);
            }

            const emptyChangedDevclasses: string[] = [];
            for (const [normalizedDevclass, devclass] of previousDevclasses) {
                if (currentDevclasses.has(normalizedDevclass)) {
                    continue;
                }

                // Simulate the cleanup followed by the incoming workbench import. At this point
                // the target packages exist, but SAP has not moved their objects there yet.
                const objectsAfterImport = new Map<string, TADIR>(
                    (await SystemConnector.getDevclassObjects(devclass, false)).map(object => [objectKey(object), object])
                );
                previousTransportObjects.forEach(object => objectsAfterImport.delete(objectKey(object)));
                incomingObjects.forEach(object => {
                    const key = objectKey(object);
                    objectsAfterImport.delete(key);
                    const installDevclass = context.rawInput.installData.installDevclass.keepOriginal
                        ? object.devclass
                        : replacementDevclasses.get(normalize(object.devclass)) || object.devclass;
                    if (normalize(installDevclass) === normalizedDevclass) {
                        objectsAfterImport.set(key, object);
                    }
                });

                if (objectsAfterImport.size === 0) {
                    emptyChangedDevclasses.push(devclass);
                }
            }
            if (emptyChangedDevclasses.length > 0) {
                Logger.log(`Adding empty previous SAP packages ${emptyChangedDevclasses.join(', ')} to cleanup transport`, true);
                await dummy.addObjects(emptyChangedDevclasses.map(devclass => ({
                    pgmid: 'R3TR',
                    object: 'DEVC',
                    objName: devclass
                })), false);
            }

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
