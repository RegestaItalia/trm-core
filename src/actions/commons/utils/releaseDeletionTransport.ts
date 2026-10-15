import { Logger } from "trm-commons";
import { Transport } from "../../../transport";
import { TransportImportError } from "../../../transport/TransportImportError";
import { AbstractRegistry, RegistryDeletionTransportUnavailableError } from "../../../registry";
import type { PackageCleanupContext } from "./packageCleanup";
import { generateDeletion } from "./generateDeletion";
import { resolveInstallRegistry } from "./installRegistry";

/**
 * Releases a transport of copies, turns it into a deletion of its whole content (see {@link generateDeletion})
 * and imports it. With `retainSnapshot` its exported content is kept for a rollback (`context.revert.dele`).
 * Returns whether something was deleted.
 */
export async function releaseDeletionTransport(
    deletionTransport: Transport,
    registry: AbstractRegistry,
    context: PackageCleanupContext,
    retainSnapshot = true
): Promise<boolean> {
    //resolved before releasing, so an unreadable local artifact leaves the transport untouched
    const deletionRegistry = await resolveInstallRegistry(registry);
    await deletionTransport.release(false, true);

    const tocBinaries = (await deletionTransport.download()).binaries;

    //saving dummy binaries for a possible revert
    if (retainSnapshot) {
        context.revert.dele = {
            trkorr: deletionTransport.trkorr,
            entries: undefined,
            binaries: tocBinaries
        };
    }

    let deletion: Transport | undefined;
    try {
        deletion = await generateDeletion({
            registry: deletionRegistry,
            source: { trkorr: deletionTransport.trkorr, entries: undefined, binaries: tocBinaries },
            legacyBackend: context.legacyBackend
        });
    } catch (e) {
        // The transport is already released and can't be deleted: it's a harmless transport of copies.
        // Nothing was imported, so there is nothing to restore.
        if (e instanceof RegistryDeletionTransportUnavailableError && retainSnapshot) {
            context.revert.dele = undefined;
        }
        throw e;
    }
    if (!deletion) {
        return false;
    }
    context.runtime.dele = deletion;
    Logger.loading(`Importing ${deletionTransport.trkorr}`, true);
    // Mark before the mutating await: the import may change objects and still fail.
    if (retainSnapshot) {
        context.revert.deleImportStarted = true;
    }
    const rc = await deletion.import(false);
    TransportImportError.assert(deletionTransport.trkorr, rc, `Import of deletion transport`, deletion.lastImportMessage);
    Logger.success(`Transport ${deletionTransport.trkorr} imported`, true);
    return true;
}
