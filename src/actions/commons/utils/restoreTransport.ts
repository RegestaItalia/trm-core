import { Logger } from "trm-commons";
import { TransportBinary } from "../../../trmPackage";
import { Transport } from "../../../transport";
import { SystemConnector } from "../../../systemConnector";

/** Re-imports the transport snapshot captured before an install transport was replaced. */
export async function restoreTransport(snapshot: TransportBinary): Promise<void> {
    Logger.loading(`Restoring transport ${snapshot.trkorr}...`, true);
    const transport = await Transport.upload(snapshot.trkorr, {
        binary: snapshot.binaries,
        trTarget: SystemConnector.getDest()
    });
    //avoid test import, it should be fine?...
    await transport.import(false);
    Logger.success(`Transport ${snapshot.trkorr} restored`, true);
}

/** Deletes a generated transport before import, or restores its snapshot after replacement/import. */
export async function revertPreparedTransport(generated: Transport | undefined, snapshot: TransportBinary | undefined): Promise<void> {
    if (generated) {
        try {
            if (await generated.canBeDeleted()) {
                await generated.delete();
                return;
            }
        } catch (error) {
            if (!snapshot) {
                throw error;
            }
        }
    }
    if (snapshot) {
        await restoreTransport(snapshot);
    }
}
