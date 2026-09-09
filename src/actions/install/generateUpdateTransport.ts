import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { releaseDeletionTransport, restoreTransport } from "../commons/utils";
import { RegistryDeletionTransportUnauthorizedError } from "../../registry";
import { PackageHierarchy, packageDataFromTdevc } from "../../commons";
import { E071, TADIR } from "../../client";
import { randomBytes } from "crypto";

function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [pkg.devclass, ...pkg.sub.flatMap(flattenDevclasses)];
}

function normalize(value: string): string {
    return value.trim().toUpperCase();
}

function objectKey(object: Pick<E071, 'pgmid' | 'object' | 'objName'>): string {
    return `${normalize(object.pgmid)}\u0000${normalize(object.object)}\u0000${normalize(object.objName)}`;
}

async function restoreCleanupPackages(context: InstallWorkflowContext): Promise<void> {
    // Snapshots are stored in deletion order: reverse it to recreate parents first.
    for (const pkg of [...(context.revert.cleanupTemporaryPackages || [])].reverse()) {
        if (await SystemConnector.getDevclass(pkg.devclass)) {
            continue;
        }
        await SystemConnector.createPackage({
            ...packageDataFromTdevc(pkg, {
                devclass: pkg.devclass,
                ctext: pkg.ctext || '',
                as4user: pkg.as4user || SystemConnector.getLogonUser(),
                dlvunit: pkg.dlvunit,
                pdevclass: pkg.pdevclass || ''
            }),
            parentcl: pkg.parentcl,
            tpclass: pkg.tpclass
        });
    }
}

async function restoreCleanupAssignments(context: InstallWorkflowContext, restorePackages: boolean): Promise<void> {
    if (restorePackages) {
        await restoreCleanupPackages(context);
    }
    const originals = context.revert.cleanupOriginalTadir || [];
    if (originals.length === 0) {
        return;
    }
    const existing = new Set((await SystemConnector.getExistingObjects(originals)).map(objectKey));
    for (const object of originals) {
        if (existing.has(objectKey(object))) {
            await SystemConnector.tadirInterface(object);
        }
    }
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

        var dummy: Transport;
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
            dummy = await Transport.createToc({
                text: `@X1@TRM (DELE) ${context.rawInput.packageData.name} ${context.runtime.update.manifest.get().version}`,
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
                Logger.loading(`Checking cleanup objects locks...`, true);
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
            const temporaryPackages = Array.from(deletionObjects.values()).filter(object =>
                normalize(object.pgmid) === 'R3TR' && normalize(object.object) === 'DEVC'
                && normalize(object.objName).startsWith('$'));
            const objectsToTransport = Array.from(deletionObjects.values()).filter(object =>
                !temporaryPackages.includes(object));
            // Cleanup exports the previous installation's objects, regardless of the new namespace.
            const needsStaging = normalize(context.runtime.update.getDevclass() || '').startsWith('$');
            let stagingDevclass: string;
            if (needsStaging && objectsToTransport.length > 0) {
                // A short-lived, transportable package lets CTS export local objects.
                do {
                    stagingDevclass = `ZTRM_DELE_${randomBytes(8).toString('hex').toUpperCase()}`; // 25 characters; DEVCLASS allows 30.
                } while (await SystemConnector.getDevclass(stagingDevclass));
                Logger.loading(`Creating package ${stagingDevclass}...`, true);
                await SystemConnector.createPackage({
                    devclass: stagingDevclass,
                    ctext: 'TRM upgrade cleanup',
                    as4user: SystemConnector.getLogonUser(),
                    dlvunit: 'HOME',
                    pdevclass: await SystemConnector.getDefaultTransportLayer()
                });
                context.revert.sapPackages.push(stagingDevclass);
                await SystemConnector.tadirInterface({
                    pgmid: 'R3TR', object: 'DEVC', objName: stagingDevclass,
                    devclass: stagingDevclass, srcsystem: 'TRM'
                });
                const existingObjects = await SystemConnector.getExistingObjects(
                    objectsToTransport.map(object => ({
                        pgmid: object.pgmid, object: object.object, objName: object.objName, devclass: ''
                    }))
                );
                context.revert.cleanupOriginalTadir = [];
                for (const object of existingObjects) {
                    context.revert.cleanupOriginalTadir.push({ ...object });
                    await SystemConnector.tadirInterface({ ...object, devclass: stagingDevclass, srcsystem: 'TRM' });
                }
            }
            if (objectsToTransport.length > 0) {
                await dummy.addObjects(objectsToTransport, false);
            }
            if (stagingDevclass) {
                await dummy.addObjects([
                    { pgmid: 'R3TR', object: 'DEVC', objName: stagingDevclass }
                ], false);
            }
            const packageDepth = (devclass: string): number => {
                const visited = new Set<string>();
                let parent = packageParents.get(normalize(devclass));
                while (parent && !visited.has(parent)) {
                    visited.add(parent);
                    parent = packageParents.get(parent);
                }
                return visited.size;
            };
            // Delete descendants before their parents, regardless of transport entry order.
            temporaryPackages.sort((a, b) => packageDepth(b.objName) - packageDepth(a.objName));
            context.revert.cleanupTemporaryPackages = [];
            // Snapshot every definition before deleting any package, including for partial failures.
            for (const devclass of temporaryPackages) {
                const pkg = await SystemConnector.getDevclass(devclass.objName);
                if (!pkg) {
                    throw new Error(`Cannot back up temporary SAP package ${devclass.objName}`);
                }
                context.revert.cleanupTemporaryPackages.push({ ...pkg });
            }
            for (const devclass of temporaryPackages) {
                try {
                    await SystemConnector.deleteTemporaryPackage(devclass.objName);
                } catch (e) {
                    Logger.warning(`Could not delete temporary SAP package ${devclass.objName}: ${e instanceof Error ? e.message : String(e)}. Manual cleanup may be necessary.`);
                }
            }

            //guard: clean and rebuild comments
            await dummy.removeComments();
            await dummy.addComment(`name=${context.runtime.package.data.manifest.name}`);
            await dummy.addComment(`version=${context.runtime.update.manifest.get().version}`);

            try {
                await releaseDeletionTransport(dummy, context.rawInput.packageData.registry, context);
            } catch (e) {
                if (!(e instanceof RegistryDeletionTransportUnauthorizedError)) {
                    throw e;
                }
                //at this point the dummy is already released, transport cannot be deleted but it's a harmless release of a transport of copies.
                Logger.warning(`User is not authorized to generate cleanup transports. Manual cleanup of previous release install might be necessary.`);
                await restoreCleanupAssignments(context, true);
            }
        } catch (e) {
            if (dummy && (await dummy.canBeDeleted())) {
                await dummy.delete();
            }
            throw e;
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        await restoreCleanupPackages(context);
        if (context.revert.dele) {
            //check if it can be deleted -> the exception might have been raised before the transport release, we can still cleanup nicely
            const transport = new Transport(context.revert.dele.trkorr);
            if (await (transport.canBeDeleted())) {
                await transport.delete();
            } else {
                await restoreTransport(context.revert.dele);
            }
        }
        await restoreCleanupAssignments(context, false);
    }
}
