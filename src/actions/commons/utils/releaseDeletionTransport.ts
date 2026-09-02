import { Inquirer, Logger } from "trm-commons";
import { BinaryTransport, Transport } from "../../../transport";
import { SystemConnector } from "../../../systemConnector";
import { AbstractRegistry, RegistryDeletionTransportUnauthorizedError } from "../../../registry";
import type { InstallWorkflowContext } from "../../install";

/** Releases and imports a deletion transport, retaining its original binaries for rollback. */
export async function releaseDeletionTransport(deletionTransport: Transport, registry: AbstractRegistry, context?: InstallWorkflowContext): Promise<void> {
    if(!context || !context.revert){ //dummy, context might not even be used
        context.revert = {
            dele: undefined,
            transports: undefined,
            sapPackages: undefined
        };
    }

    await deletionTransport.release(false, true);

    const tocBinaries = (await deletionTransport.download()).binaries;

    //saving dummy binaries for a possible revert
    context.revert.dele = {
        trkorr: deletionTransport.trkorr,
        entries: undefined,
        binaries: tocBinaries
    };

    let deleBinaries: BinaryTransport;
    try {
        deleBinaries = await registry.delete(tocBinaries);
    } catch (e) {
        if (e instanceof RegistryDeletionTransportUnauthorizedError) {
            await deletionTransport.delete();
            context.revert.dele = undefined;
        }
        throw e;
    }

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
        Logger.loading(`Testing import of ${deletionTransport.trkorr}...`);
        const testRc = await context.runtime.dele.import(true);
        if (testRc < 0 || testRc > 8) {
            throw new Error(`Test import of transport ${deletionTransport.trkorr} failed: check logs.`);
        }
        Logger.loading(`Importing ${deletionTransport.trkorr}`, true);
        await context.runtime.dele.import(false);
        Logger.success(`Transport ${deletionTransport.trkorr} imported`, true);
        deletionTransport = context.runtime.dele; //replace
    } finally {
        Logger.setPrefix(originalLPrefix);
        Inquirer.setPrefix(originalIPrefix);
    }
}
