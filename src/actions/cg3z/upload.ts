import { Step } from "@simonegaffurini/sammarksworkflow";
import { Cg3zWorkflowContext } from ".";
import { Transport } from "../../transport";
import { Logger } from "trm-commons";
import * as AdmZip from "adm-zip";
import { SystemConnector } from "../../systemConnector";

export function parseTransportArchive(binaries: Buffer): {
    header: AdmZip.IZipEntry,
    data: AdmZip.IZipEntry,
    trkorr: string
} {
    const zip = new AdmZip.default(binaries);
    const headers: AdmZip.IZipEntry[] = [];
    const data: AdmZip.IZipEntry[] = [];
    zip.forEach(entry => {
        if (entry.entryName.startsWith("K")) headers.push(entry);
        if (entry.entryName.startsWith("R")) data.push(entry);
    });
    if (headers.length !== 1 || data.length !== 1) {
        throw new Error("Transport archive must contain exactly one header and one data file.");
    }
    const trkorr = Transport.getTrkorrFromFileName(data[0].entryName);
    if (Transport.getTrkorrFromFileName(headers[0].entryName) !== trkorr) {
        throw new Error("Transport header and data don't match!");
    }
    return { header: headers[0], data: data[0], trkorr };
}

/**
 * Workflow step that validates, uploads, forwards, and refreshes a transport archive.
 * 
 * 1- identifying transport
 * 
 * 2- upload
 * 
*/
export const upload: Step<Cg3zWorkflowContext> = {
    name: 'upload',
    run: async (context: Cg3zWorkflowContext): Promise<void> => {
        //1- identifying transport
        Logger.loading(`Reading data...`);
        const archive = parseTransportArchive(context.rawInput.binaries);
        context.output = {
            trkorr: archive.trkorr
        };

        //2- upload
        Logger.loading(`Uploading transport ${Transport.getTransportIcon()}  ${context.output.trkorr}...`);
        context.runtime.transport = new Transport(context.output.trkorr, SystemConnector.getDest());
        await Transport.upload(
            context.output.trkorr, {
                binary: {
                    header: archive.header.getData(),
                    data: archive.data.getData()
                },
                trTarget: SystemConnector.getDest()
        });

        //3- forward
        Logger.loading(`Forwarding transport ${Transport.getTransportIcon()}  ${context.output.trkorr}...`);
        await SystemConnector.forwardTransport(context.output.trkorr, SystemConnector.getDest(), SystemConnector.getDest(), true);

        //4- refresh text
        try {
            Logger.loading(`Refreshing transport ${Transport.getTransportIcon()}  ${context.output.trkorr}...`);
            await SystemConnector.refreshTransportTmsTxt(context.output.trkorr);
        } catch {
            Logger.warning(`Coudln't refresh transport text!`);
        }
    },
    revert: async (context: Cg3zWorkflowContext): Promise<void> => {
        if (context.runtime?.transport && await context.runtime.transport.canBeDeleted()) {
            await context.runtime.transport.delete();
        }
    }
}
