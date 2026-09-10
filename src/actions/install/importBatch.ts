import { Step } from "@simonegaffurini/sammarksworkflow";
import { Inquirer, Logger } from "trm-commons";
import type { E071, TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { InstallWorkflowContext } from ".";
import { RegistryDeletionTransportUnauthorizedError } from "../../registry";
import { releaseDeletionTransport } from "../commons/utils";

function entryKey(entry: { pgmid: string, object: string, objName: string }): string {
    return `${entry.pgmid.trim().toUpperCase()}\u0000${entry.object.trim().toUpperCase()}\u0000${entry.objName.trim().toUpperCase()}`;
}

function importedTransports(context: InstallWorkflowContext): Transport[] {
    return [
        context.runtime.transports.tadir.instance,
        context.runtime.transports.devc.instance,
        context.runtime.transports.lang?.instance,
        ...(context.runtime.transports.cust || []).map(cust => cust.instance)
    ].filter((transport): transport is Transport => Boolean(transport));
}

async function snapshotImportedEntries(context: InstallWorkflowContext, transports: Transport[]): Promise<void> {
    const entries = (await Promise.all(transports.map(transport => transport.getE071()))).flat();
    context.revert.importedEntries = Array.from(
        new Map(entries.map(entry => [entryKey(entry), entry])).values()
    );
}

function cleanupEntries(context: InstallWorkflowContext): E071[] {
    const entries = new Map(
        (context.revert.importedEntries || [])
            // Temporary packages have a dedicated deletion API. Their other
            // imported objects still remain in the single workbench cleanup
            // transport, but the DEVC row itself must not be transported.
            .filter(entry => !(entry.pgmid.trim().toUpperCase() === 'R3TR'
                && entry.object.trim().toUpperCase() === 'DEVC'
                && entry.objName.trim().startsWith('$')))
            .map(entry => [entryKey(entry), entry])
    );

    for (const devclass of context.revert.sapPackages.filter(devclass => !devclass.startsWith('$'))) {
        const entry = { pgmid: 'R3TR', object: 'DEVC', objName: devclass };
        entries.set(entryKey(entry), entry);
    }
    if (context.revert.namespace) {
        const entry = { pgmid: 'R3TR', object: 'NSPC', objName: context.revert.namespace };
        entries.set(entryKey(entry), entry);
    }
    return Array.from(entries.values());
}

export async function deleteImportedEntries(context: InstallWorkflowContext): Promise<void> {
    if (context.revert.cleanupImported) {
        return;
    }

    let cleanupError: unknown;
    let workbenchSucceeded = true;
    const entries = cleanupEntries(context);
    if (entries.length > 0) {
        try {
            if (!context.revert.cleanupTransport) {
                context.revert.cleanupTransport = await Transport.createToc({
                    text: `@X1@TRM (DELE) ${context.rawInput.packageData.name} ${context.runtime.package.data.manifest.version}`,
                    target: SystemConnector.getDest()
                });
            }
            const cleanupTransport = context.revert.cleanupTransport;
            await cleanupTransport.addObjects(entries, false);
            const transportEntries = await cleanupTransport.getE071();
            if (transportEntries.length > 0) {
                await releaseDeletionTransport(cleanupTransport, context.rawInput.packageData.registry, context, false);
            } else {
                await cleanupTransport.delete();
            }
        } catch (error) {
            workbenchSucceeded = false;
            if (error instanceof RegistryDeletionTransportUnauthorizedError) {
                context.revert.cleanupTransport = undefined;
                Logger.warning(`User is not authorized to generate cleanup transports. Manual cleanup of imported entries might be necessary.`);
            } else {
                cleanupError = error;
                const cleanupTransport = context.revert.cleanupTransport;
                if (cleanupTransport) {
                    try {
                        if (await cleanupTransport.canBeDeleted()) {
                            await cleanupTransport.delete();
                        }
                    } catch (deleteError) {
                        cleanupError ||= deleteError;
                    }
                }
            }
        }
    }

    const temporaryPackages = new Set(
        context.revert.sapPackages.filter(devclass => devclass.startsWith('$'))
    );
    for (const entry of context.revert.importedEntries || []) {
        if (entry.pgmid.trim().toUpperCase() === 'R3TR'
            && entry.object.trim().toUpperCase() === 'DEVC'
            && entry.objName.trim().startsWith('$')) {
            temporaryPackages.add(entry.objName.trim());
        }
    }

    let temporaryPackagesSucceeded = true;
    for (const devclass of temporaryPackages) {
        try {
            await SystemConnector.deleteTemporaryPackage(devclass);
        } catch (error) {
            temporaryPackagesSucceeded = false;
            cleanupError ||= error;
        }
    }

    // A failed cleanup is terminal for this rollback pass. In particular, prepared
    // payloads must not be restored on top of objects that were not deleted.
    context.revert.cleanupSucceeded = workbenchSucceeded && temporaryPackagesSucceeded;
    context.revert.cleanupImported = true;
    if (cleanupError) {
        throw cleanupError;
    }
}

/**
 * Workflow step that imports every prepared transport in one TMS batch.
 *
 * 1- collect prepared transport instances
 *
 * 2- import transports in batch
 *
 * 3- reconnect when system is not stateless
 *
 * 4- finalize SAP Packages import
 *
 * 5- finalize workbench import
 *
 */
export const importBatch: Step<InstallWorkflowContext> = {
    name: 'import-batch',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- collect prepared transport instances
        const transports = importedTransports(context);

        //2- snapshot every entry that may be imported. The deletion transport itself
        // is created only during revert, so it cannot lock objects before this import.
        await snapshotImportedEntries(context, transports);

        //3- import transports in batch
        Logger.loading(`Installing...`);
        context.revert.importStarted = true;
        await Transport.importMultiple(transports, SystemConnector.getDest(), false);

        //4- reconnect when system is not stateless
        if (!SystemConnector.isStateless()) {
            Logger.loading(`Closing connection for reconnect...`, true);
            await SystemConnector.closeConnection();
            Logger.loading(`Reopening connection...`, true);
            await SystemConnector.connect(true);
            Logger.success(`OK, continue`, true);
        }

        //5- finalize SAP Packages import
        if (context.runtime.transports.devc.instance) {
            Logger.loading(`Finalizing SAP Packages import...`);
            for (const tdevc of context.runtime.transports.devc.binaries.entries.tdevc || []) {
                const previous = await SystemConnector.getDevclass(tdevc.devclass);
                const isGenerated = context.revert.sapPackages.includes(tdevc.devclass);
                if (context.runtime.update && !isGenerated && previous?.pdevclass
                    && !(context.revert.packageTransportLayers || []).some(layer => layer.devclass === tdevc.devclass)) {
                    context.revert.packageTransportLayers ||= [];
                    context.revert.packageTransportLayers.push({
                        devclass: tdevc.devclass,
                        transportLayer: previous.pdevclass
                    });
                }
                Logger.log(`Running TDEVC interface for devclass ${tdevc.devclass} -> transport layer ${context.rawInput.installData.installDevclass.transportLayer}`, true);
                await SystemConnector.setPackageTransportLayer(tdevc.devclass, context.rawInput.installData.installDevclass.transportLayer);
            }

            const rootDevclass = context.runtime.rootDevclassBeforeImport;
            if (rootDevclass?.parentcl) {
                await SystemConnector.setPackageSuperpackage(context.runtime.package.hierarchy.devclass, rootDevclass.parentcl);
            } else {
                await SystemConnector.clearPackageSuperpackage(context.runtime.package.hierarchy.devclass);
            }

            for (const tadir of (context.runtime.transports.devc.binaries.entries.tadir || []).filter(entry => entry.srcsystem !== 'TRM')) {
                const object: TADIR = {
                    pgmid: tadir.pgmid,
                    object: tadir.object,
                    objName: tadir.objName,
                    devclass: tadir.devclass,
                    srcsystem: 'TRM'
                };
                Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${object.devclass} -> src system ${object.srcsystem}`, true);
                await SystemConnector.tadirInterface(object);
            }
        }

        // A former subpackage promoted to the installation root must not retain its
        // old superpackage. Do this after cleanup has inspected the old hierarchy.
        if (!context.rawInput.installData.installDevclass.keepOriginal && context.runtime.update) {
            const rootReplacement = context.rawInput.installData.installDevclass.replacements.find(
                replacement => replacement.originalDevclass === context.runtime.package.hierarchy.devclass
            );
            const previousRoot = context.runtime.update.getDevclass();
            if (rootReplacement && previousRoot
                && rootReplacement.installDevclass.trim().toUpperCase() !== previousRoot.trim().toUpperCase()) {
                await SystemConnector.clearPackageSuperpackage(rootReplacement.installDevclass);
            }
        }

        //6- finalize workbench import
        Logger.loading(`Finalizing workbench import...`);
        for (const tadir of context.runtime.transports.tadir.binaries.entries.tadir || []) {
            const object: TADIR = {
                pgmid: tadir.pgmid,
                object: tadir.object,
                objName: tadir.objName,
                devclass: tadir.devclass,
                srcsystem: 'TRM'
            };
            if (!context.rawInput.installData.installDevclass.keepOriginal) {
                const replacementDevclass = context.rawInput.installData.installDevclass.replacements.find(entry => entry.originalDevclass === tadir.devclass);
                if (!replacementDevclass?.installDevclass) {
                    throw new Error(`Replacement ABAP package not found for ${tadir.devclass}!`);
                }
                object.devclass = replacementDevclass.installDevclass;
            }
            Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${tadir.devclass} -> ${object.devclass}, src system ${tadir.srcsystem} -> ${object.srcsystem}`, true);
            await SystemConnector.tadirInterface(object);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        // Run before the prepare-* reverts restore the transport snapshots.
        await deleteImportedEntries(context);
    }
};
