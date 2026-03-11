import { Step } from "@simonegaffurini/sammarksworkflow";
import { Cg3yWorkflowContext } from ".";
import { Transport } from "../../transport";
import { Logger } from "trm-commons";
import * as AdmZip from "adm-zip";
import { SystemConnector } from "../../systemConnector";

/**
 * Download
 * 
 * 1- check is released
 * 
 * 2- download
 * 
 * 3- zip
 * 
*/
export const download: Step<Cg3yWorkflowContext> = {
    name: 'download',
    run: async (context: Cg3yWorkflowContext): Promise<void> => {
        Logger.log('Download step', true);
        const transport = new Transport(context.rawInput.trkorr);
        Logger.loading(`Checking "${transport.trkorr}"...`);
        const exists = !!(await transport.getE070());
        if(!exists){
            throw new Error(`Transport "${transport.trkorr}" was not found in ${SystemConnector.getDest()}.`);
        }

        //1- check is released
        const isReleased = await transport.isReleased();
        if (!isReleased) {
            throw new Error(`Transport "${transport.trkorr}" is not released. To download, release it first.`);
        }

        //2- download
        Logger.loading(`Downloading transport ${Transport.getTransportIcon()}  ${transport.trkorr}...`);
        const data = await transport.download();

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