import { Inquirer, Logger } from "trm-commons";
import { Transport } from "../../../transport";
import { SystemConnector } from "../../../systemConnector";
import { AbstractRegistry } from "../../../registry";
import type { InstallWorkflowContext } from "../../install";

/** Releases and imports a deletion transport, retaining its original binaries for rollback. */
export async function releaseDeletionTransport(deletionTransport: Transport, registry: AbstractRegistry, context: InstallWorkflowContext): Promise<void> {
    await deletionTransport.release(false, true);
    
    const tocBinaries = (await deletionTransport.download()).binaries;

    //saving dummy binaries for a possible revert
    context.revert.dele = {
        trkorr: deletionTransport.trkorr,
        entries: undefined,
        binaries: tocBinaries
    };

    const deleBinaries = await registry.delete(tocBinaries);

    //upload transport binaries
    Logger.loading(`Uploading deletion transport...`);
    context.runtime.dele = await Transport.upload(deletionTransport.trkorr, {
        binary: deleBinaries,
        trTarget: SystemConnector.getDest()
    });

    //3- import transport
    const originalLPrefix = Logger.getPrefix();
    const originalIPrefix = Inquirer.getPrefix();
    const prefix = `(${Transport.getTransportIcon()}  Deletion) `;
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
        Logger.loading(`Importing ${deletionTransport.trkorr}`, true);
        await context.runtime.dele.import();
        Logger.success(`Transport ${deletionTransport.trkorr} imported`, true);
    } finally {
        Logger.setPrefix(originalLPrefix);
        Inquirer.setPrefix(originalIPrefix);
    }
}
