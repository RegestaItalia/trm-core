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
    await transport.import();
    Logger.success(`Transport ${snapshot.trkorr} restored`, true);
}
