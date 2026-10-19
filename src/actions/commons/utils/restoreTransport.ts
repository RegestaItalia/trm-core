import { Logger } from "trm-commons";
import { TransportBinary } from "../../../trmPackage";
import { Transport } from "../../../transport";
import { TransportImportError } from "../../../transport/TransportImportError";
import { SystemConnector } from "../../../systemConnector";
import { dequeueTransport } from "./importQueue";

/** Re-imports a transport snapshot (e.g. a backup) into the connected system. Fails on return codes from 8. */
export async function restoreTransport(snapshot: TransportBinary, ignoreImportErrors?: boolean): Promise<void> {
    Logger.loading(`Restoring transport ${snapshot.trkorr}...`, true);
    const transport = await Transport.upload(snapshot.trkorr, {
        binary: snapshot.binaries,
        trTarget: SystemConnector.getDest()
    });
    //avoid test import, it should be fine?...
    const rc = await transport.import(false);
    TransportImportError.assert(snapshot.trkorr, rc, `Restore of transport ${snapshot.trkorr}`, transport.lastImportMessage, ignoreImportErrors);
    Logger.success(`Transport ${snapshot.trkorr} restored`, true);
}

/**
 * Reverts a dummy transport generated to receive a release payload: deleted while it can be,
 * otherwise (released) taken out of the connected system's import queue so the payload can't be imported again.
 * Its released, empty, content is never re-imported: the objects are restored from the backup transports.
 */
export async function revertPreparedTransport(generated: Transport | undefined): Promise<void> {
    if (!generated) {
        return;
    }
    if (await generated.canBeDeleted()) {
        await generated.delete();
        return;
    }
    await dequeueTransport(generated.trkorr, 'prepared');
}
