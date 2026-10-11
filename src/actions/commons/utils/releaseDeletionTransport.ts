import { Inquirer, Logger } from "trm-commons";
import { BinaryTransport, Transport } from "../../../transport";
import { SystemConnector } from "../../../systemConnector";
import { AbstractRegistry, RegistryDeletionTransportUnavailableError } from "../../../registry";
import type { PackageCleanupContext } from "./packageCleanup";
import { resolveInstallRegistry } from "./installRegistry";

/** Releases and imports a deletion transport, retaining its original binaries for rollback. */
export async function releaseDeletionTransport(
    deletionTransport: Transport,
    registry: AbstractRegistry,
    context: PackageCleanupContext,
    retainSnapshot = true
): Promise<void> {
    //a local artifact can't generate deletion transports: the registry it was published to does.
    //resolved before releasing, so an unreadable artifact leaves the transport untouched
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

    let deleBinaries: BinaryTransport;
    try {
        deleBinaries = await deletionRegistry.delete(tocBinaries);
    } catch (e) {
        // The transport is already released and can't be deleted: it's a harmless transport of copies.
        // Nothing was imported, so there is nothing to restore and nothing to forward.
        if (e instanceof RegistryDeletionTransportUnavailableError && retainSnapshot) {
            context.revert.dele = undefined;
        }
        throw e;
    }

    //upload transport binaries
    Logger.loading(`Uploading transport...`);
    context.runtime.dele = await Transport.upload(deletionTransport.trkorr, {
        binary: deleBinaries,
        trTarget: SystemConnector.getDest()
    });

    //3- import transport
    Logger.loading(`Testing import...`);
    const testRc = await context.runtime.dele.import(true);
    if (testRc < 0 || testRc > 8) {
        throw new Error(`Test import of deletion transport failed: check logs.`);
    }
    Logger.loading(`Importing ${deletionTransport.trkorr}`, true);
    // Mark before the mutating await: the import may change objects and still fail.
    if (retainSnapshot) {
        context.revert.deleImportStarted = true;
    }
    await context.runtime.dele.import(false);
    Logger.success(`Transport ${deletionTransport.trkorr} imported`, true);
    deletionTransport = context.runtime.dele; //replace
}
