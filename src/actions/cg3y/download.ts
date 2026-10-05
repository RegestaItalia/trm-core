import { Step } from "@simonegaffurini/sammarksworkflow";
import { Cg3yWorkflowContext } from ".";
import { Transport } from "../../transport";
import { Logger } from "trm-commons";
import * as AdmZip from "adm-zip";
import { SystemConnector } from "../../systemConnector";

/**
 * Workflow step that verifies and exports a released transport into a ZIP archive.
 * 
 * 1- check is released, exportable request
 * 
 * 2- download
 * 
 * 3- zip
 * 
*/

const TRKORR_PATTERN = /^[A-Z0-9]{3}K\d{6}$/;
const TASK_TRFUNCTIONS = ['S', 'R', 'Q', 'X'];

function isEmptyBinary(buffer: Buffer): boolean {
    return !buffer || buffer.length === 0;
}

export const download: Step<Cg3yWorkflowContext> = {
    name: 'download',
    run: async (context: Cg3yWorkflowContext): Promise<void> => {
        const trkorr = (context.rawInput.trkorr || '').trim().toUpperCase();
        if (!TRKORR_PATTERN.test(trkorr)) {
            throw new Error(`Invalid transport number "${context.rawInput.trkorr}".`);
        }
        const transport = new Transport(trkorr);
        Logger.loading(`Checking "${transport.trkorr}"...`);
        const e070 = await transport.getE070();
        if(!e070){
            throw new Error(`Transport "${transport.trkorr}" was not found in ${SystemConnector.getDest()}.`);
        }

        //1- check is released, exportable request
        if (TASK_TRFUNCTIONS.includes(e070.trfunction)) {
            throw new Error(`"${transport.trkorr}" is a task, not a transport request. Download its request instead.`);
        }
        const isReleased = await transport.isReleased();
        if (!isReleased) {
            throw new Error(`Transport "${transport.trkorr}" is not released. To download, release it first.`);
        }
        if (!(e070.tarsystem || '').trim()) {
            throw new Error(`Transport "${transport.trkorr}" is a local request (no target system) and has no export files.`);
        }

        //2- download
        Logger.loading(`Downloading transport ${Transport.getTransportIcon()}  ${transport.trkorr}...`);
        const data = await transport.download();
        if (isEmptyBinary(data.binaries.header) || isEmptyBinary(data.binaries.data)) {
            throw new Error(`Transport "${transport.trkorr}" export files are missing or empty.`);
        }

        //3- zip
        const zip = new AdmZip.default();
        zip.addFile(data.filenames.header, data.binaries.header);
        zip.addFile(data.filenames.data, data.binaries.data);
        const buffer = await zip.toBufferPromise();
        context.output = {
            binaries: buffer
        }
    }
}
