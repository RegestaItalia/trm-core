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
            const previousTransportObjects = context.runtime.update.getTransport()
                ? await context.runtime.update.getTransport().getE071()
                : [];
            const incomingObjects = context.runtime.transports.tadir.binaries.entries.tadir || [];
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
            previousTransportObjects.forEach(object => {
                if (normalize(object.pgmid) === 'R3TR' && normalize(object.object) === 'DEVC') {
                    previousDevclasses.set(normalize(object.objName), object.objName);
                }
            });
            const installedDevclasses = new Set(previousDevclasses.keys());
            const generatedDevclasses = new Set(context.revert.sapPackages.map(normalize));

            // Installation mappings do not include subpackages created locally afterwards.
            // Inspect the live hierarchy even when the installation keeps its root package.
            const packageParents = new Map<string, string>();
            for (const devclass of Array.from(previousDevclasses.values())) {
                for (const subpackage of await SystemConnector.getSubpackages(devclass)) {
                    const key = normalize(subpackage.devclass);
                    previousDevclasses.set(key, subpackage.devclass);
                    if (subpackage.parentcl) {
                        packageParents.set(key, normalize(subpackage.parentcl));
                    }
                }
            }

            // Local additions remain cleanup candidates even when reused as incoming targets.
            // The first local package owns the decision for its locally added descendants.
            const cleanupGroups = new Map<string, Set<string>>();
            for (const normalizedDevclass of previousDevclasses.keys()) {
                const locallyAdded = !installedDevclasses.has(normalizedDevclass);
                if (generatedDevclasses.has(normalizedDevclass) || (!locallyAdded && currentDevclasses.has(normalizedDevclass))) {
                    continue;
                }
                let root = normalizedDevclass;
                const visited = new Set([root]);
                let parent = packageParents.get(root);
                while (parent && previousDevclasses.has(parent) && !generatedDevclasses.has(parent)
                    && (!installedDevclasses.has(parent) === locallyAdded)
                    && (locallyAdded || !currentDevclasses.has(parent)) && !visited.has(parent)) {
                    root = parent;
                    visited.add(root);
                    parent = packageParents.get(root);
                }
                if (!cleanupGroups.has(root)) {
                    cleanupGroups.set(root, new Set());
                }
                cleanupGroups.get(root).add(normalizedDevclass);
            }

            const changedDevclassesToDelete: string[] = [];
            const extraObjectsToDelete = new Map<string, Pick<E071, 'pgmid' | 'object' | 'objName'>>();
            for (const [root, group] of cleanupGroups) {
                const devclass = previousDevclasses.get(root);

                // Only objects outside both releases need an extra cleanup decision.
                const objectsAfterImport = new Map<string, TADIR>();
                for (const member of group) {
                    for (const object of await SystemConnector.getDevclassObjects(previousDevclasses.get(member), false)) {
                        // Package definitions follow the decision for the whole subtree.
                        if (!(normalize(object.pgmid) === 'R3TR' && normalize(object.object) === 'DEVC')) {
                            objectsAfterImport.set(objectKey(object), object);
                        }
                    }
                }
                previousTransportObjects.forEach(object => objectsAfterImport.delete(objectKey(object)));
                incomingObjects.forEach(object => {
                    objectsAfterImport.delete(objectKey(object));
                });

                // Every locally added package definition is an extra object, including
                // the root of this cleanup group, regardless of whether it has contents.
                const packagesToRemove = Array.from(group).filter(member => !currentDevclasses.has(member));
                const extraObjectCount = objectsAfterImport.size + packagesToRemove.filter(member => !installedDevclasses.has(member)).length;
                if (extraObjectCount > 0) {
                    const { deleteExtraObjects } = context.rawInput.contextData.noInquirer
                        ? { deleteExtraObjects: true }
                        : await Inquirer.prompt({
                        name: 'deleteExtraObjects',
                        type: 'confirm',
                        message: `Cleanup of SAP package ${devclass}${group.size > 1 ? ' and its subpackages' : ''} will delete ${extraObjectCount} extra objects outside this installation. Continue?`,
                        default: true
                    });
                    if (!deleteExtraObjects) {
                        continue;
                    }
                    objectsAfterImport.forEach((object, key) => extraObjectsToDelete.set(key, {
                        pgmid: object.pgmid,
                        object: object.object,
                        objName: object.objName
                    }));
                }
                changedDevclassesToDelete.push(...packagesToRemove.map(member => previousDevclasses.get(member)));
            }

            // A retained child still needs its ancestors, including when cleanup was declined.
            const deletableDevclasses = new Set(changedDevclassesToDelete.map(normalize));
            for (const devclass of previousDevclasses.keys()) {
                if (deletableDevclasses.has(devclass)) {
                    continue;
                }
                const visited = new Set<string>();
                let parent = packageParents.get(devclass);
                while (parent && !visited.has(parent)) {
                    visited.add(parent);
                    deletableDevclasses.delete(parent);
                    parent = packageParents.get(parent);
                }
            }
            const packagesToDelete = changedDevclassesToDelete.filter(devclass => deletableDevclasses.has(normalize(devclass)));
            const additionalObjects = [...extraObjectsToDelete.values(), ...packagesToDelete.map(devclass => ({
                pgmid: 'R3TR',
                object: 'DEVC',
                objName: devclass
            }))];
            // Validate the complete deletion selection before adding anything to the transport.
            const deletionObjects = new Map([...previousTransportObjects, ...additionalObjects].map(object => [objectKey(object), object]));
            if (deletionObjects.size > 0) {
                Logger.loading(`Checking cleanup objects locks...`);
                const locks = await SystemConnector.getObjectsLocks(Array.from(deletionObjects.values(), object => ({
                    PGMID: object.pgmid,
                    OBJECT: object.object,
                    OBJ_NAME: object.objName
                })));
                if (locks.length > 0) {
                    locks.forEach(lock => Logger.error(`${lock.pgmid} ${lock.object} ${lock.objName} is currently locked in transport ${lock.trkorr}`));
                    throw new Error(`Update aborted. To continue, all cleanup objects and SAP packages must be released`);
                }
            }
            if (context.runtime.update.getTransport()) {
                await dummy.addObjectsFromTransport(context.runtime.update.getTransport().trkorr);
            }
            if (packagesToDelete.length > 0) {
                Logger.log(`Adding previous SAP packages ${packagesToDelete.join(', ')} to cleanup transport`, true);
            }
            if (additionalObjects.length > 0) {
                Logger.loading(`Generating transport...`);
                await dummy.addObjects(additionalObjects, false);
            }

            try {
                await releaseDeletionTransport(dummy, context.rawInput.packageData.registry, context);
            } catch (e) {
                if (!(e instanceof RegistryDeletionTransportUnauthorizedError)) {
                    throw e;
                }
                //at this point the dummy is already released, transport cannot be deleted but it's a harmless release of a transport of copies.
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
