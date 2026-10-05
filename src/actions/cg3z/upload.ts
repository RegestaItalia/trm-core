import { Step } from "@simonegaffurini/sammarksworkflow";
import { Cg3zWorkflowContext } from ".";
import { Transport } from "../../transport";
import { Logger } from "trm-commons";
import * as AdmZip from "adm-zip";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";

const TRANSPORT_FILE_PATTERN = /^([KR])([A-Z0-9]{6,})\.([A-Z0-9]{3})$/;

/**
 * Parses a transport file name (`K900001.TST` / `R900001.TST`), ignoring any folder prefix and case.
 *
 * @returns The file kind and transport number, or `undefined` when the name is not a transport file.
 */
function parseTransportFileName(entryName: string): { kind: 'K' | 'R', trkorr: string } | undefined {
    const baseName = entryName.split(/[\\/]/).pop().trim().toUpperCase();
    const match = TRANSPORT_FILE_PATTERN.exec(baseName);
    if (!match) {
        return undefined;
    }
    return {
        kind: match[1] as 'K' | 'R',
        trkorr: `${match[3]}K${match[2]}`
    };
}

export function parseTransportArchive(binaries: Buffer): {
    header: AdmZip.IZipEntry,
    data: AdmZip.IZipEntry,
    trkorr: string
} {
    const zip = new AdmZip.default(binaries);
    const headers: { entry: AdmZip.IZipEntry, trkorr: string }[] = [];
    const data: { entry: AdmZip.IZipEntry, trkorr: string }[] = [];
    zip.forEach(entry => {
        if (entry.isDirectory) return;
        const file = parseTransportFileName(entry.entryName);
        if (!file) return;
        (file.kind === 'K' ? headers : data).push({ entry, trkorr: file.trkorr });
    });
    if (headers.length !== 1 || data.length !== 1) {
        throw new Error(`Transport archive must contain exactly one header (K<number>.<SID>) and one data (R<number>.<SID>) file, found ${headers.length} header(s) and ${data.length} data file(s).`);
    }
    const trkorr = data[0].trkorr;
    if (headers[0].trkorr !== trkorr) {
        throw new Error(`Transport header (${headers[0].trkorr}) and data (${trkorr}) don't match!`);
    }
    return { header: headers[0].entry, data: data[0].entry, trkorr };
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
        stopWarning('cg3z');
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
        } catch (e) {
            Logger.warning(`Couldn't refresh transport ${context.output.trkorr} text: ${e?.message || e}`);
        }
    },
    revert: async (context: Cg3zWorkflowContext): Promise<void> => {
        if (context.runtime?.transport && await context.runtime.transport.canBeDeleted()) {
            await context.runtime.transport.delete();
        }
    }
}
