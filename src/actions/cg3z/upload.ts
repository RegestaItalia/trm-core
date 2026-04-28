import { Step } from "@simonegaffurini/sammarksworkflow";
import { Cg3zWorkflowContext } from ".";
import { Transport } from "../../transport";
import { Logger } from "trm-commons";
import * as AdmZip from "adm-zip";
import { SystemConnector } from "../../systemConnector";

/**
 * Upload
 * 
 * 1- identifying transport
 * 
 * 2- upload
 * 
*/
export const upload: Step<Cg3zWorkflowContext> = {
    name: 'upload',
    run: async (context: Cg3zWorkflowContext): Promise<void> => {
        Logger.log('Upload step', true);

        //1- identifying transport
        Logger.loading(`Reading data...`);
        const zip = new AdmZip.default(context.rawInput.binaries);
        var aHeader: AdmZip.IZipEntry[] = [];
        var aData: AdmZip.IZipEntry[] = [];
        zip.forEach(e => {
            if (e.entryName.startsWith('K')) {
                aHeader.push(e);
            }
            if (e.entryName.startsWith('R')) {
                aData.push(e);
            }
        });
        if (aHeader.length === 0) {
            throw new Error(`Couldn't find transport header file.`);
        }
        if (aData.length === 0) {
            throw new Error(`Couldn't find transport data file.`);
        }
        if (aHeader.length > 1 || aData.length > 1) {
            throw new Error(`Found multiple transports in same zip file!`);
        }
        context.output = {
            trkorr: Transport.getTrkorrFromFileName(aData[0].entryName)
        };
        if (Transport.getTrkorrFromFileName(aHeader[0].entryName) !== context.output.trkorr) {
            throw new Error(`Transport header and data don't match!`);
        }

        //2- upload
        Logger.loading(`Uploading transport ${Transport.getTransportIcon()}  ${context.output.trkorr}...`);
        await Transport.upload(
            context.output.trkorr, {
                binary: {
                    header: aHeader[0].getData(),
                    data: aData[0].getData()
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
    }
}