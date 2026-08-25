import { TRKORR } from "../client";
import { Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { BinaryTransport, FileNames, Transport, TrmTransportIdentifier } from "../transport";
import * as AdmZip from "adm-zip";
import { TransportBinary } from "./TransportBinary";
import { normalize } from "../commons";

const DIST_FOLDER = 'dist';
const SRC_FOLDER = 'src';

export class TrmArtifact {
    private _zip: AdmZip;
    private _filePath: string;
    private _transportBinaries: TransportBinary[];

    constructor(public binary: Buffer, private _distFolder?: string, private _manifest?: Manifest) {
        this._zip = new AdmZip.default(binary);
    }

    public setFilePath(filePath: string) {
        this._filePath = filePath;
    }

    public getManifest(): Manifest | null {
        if (this._manifest === undefined) {
            const zipEntries = this._zip.getEntries();
            const manifestEntry = zipEntries.find(o => o.comment?.trim().toLowerCase() === 'manifest');
            const sapEntriesEntry = zipEntries.find(o => o.comment?.trim().toLowerCase() === 'sap_entries');
            if (!manifestEntry) {
                this._manifest = null;
            } else {
                var jsonManifest = JSON.parse(manifestEntry.getData().toString());
                if (!jsonManifest.sapEntries) {
                    jsonManifest.sapEntries = {};
                }
                if (sapEntriesEntry) {
                    const sapEntries = JSON.parse(sapEntriesEntry.getData().toString());
                    jsonManifest.sapEntries = { ...jsonManifest.sapEntries, ...sapEntries };
                }
                const trmManifest = Manifest.normalize(jsonManifest, false);
                this._manifest = new Manifest(trmManifest, this._filePath);
            }
        }
        return this._manifest;
    }

    public replaceManifest(oManifest: Manifest) {
        const manifestBuffer = Buffer.from(oManifest.getJSON(), 'utf8');
        this._zip.updateFile('manifest.json', manifestBuffer);
    }

    public getDistFolder(): string | null {
        if (!this._distFolder) {
            this._distFolder = this.getManifest()?.get().distFolder;
        }
        return this._distFolder;
    }

    public async getTransportBinaries(): Promise<TransportBinary[]> {
        if (this._transportBinaries === undefined) {
            const distFolder = this.getDistFolder();
            if (!distFolder) {
                throw new Error(`Unable to locate dist folder.`);
            }
            const zipEntries = this._zip.getEntries();
            this._transportBinaries = [];
            for (const entry of zipEntries.filter(o => o.entryName.startsWith(distFolder))) {
                //entry that start with dist are only be zipped header, data and entries file
                try {
                    const zippedTransport = new AdmZip.default(entry.getData());
                    const header = zippedTransport.getEntries().find(o => o.comment === 'header');
                    const data = zippedTransport.getEntries().find(o => o.comment === 'data');
                    const entries = zippedTransport.getEntries().find(o => o.comment === 'entries');
                    this._transportBinaries.push({
                        trkorr: entry.name,
                        type: entry.comment as TrmTransportIdentifier,
                        entries: normalize(JSON.parse(entries.getData().toString())),
                        binaries: {
                            header: header.getData(),
                            data: data.getData()
                        }
                    });
                } catch (e) {
                    Logger.error(`Malformed artifact!`, true);
                    Logger.error(e.toString(), true);
                }
            }
        }
        return this._transportBinaries;
    }

    public async getContent(r3transConfig?: any): Promise<any> {
        //TODO: DELETE
        return null;
    }

    public static async create(data: {
        transports: Transport[],
        manifest: Manifest,
        sourceCode?: Buffer,
        distFolder?: string
        srcFolder?: string
    }): Promise<TrmArtifact> {
        Logger.log(`Generating artifact with transports ${JSON.stringify(data.transports.map(o => o.trkorr))}`, true);
        const artifact = new AdmZip.default();
        data.distFolder = data.distFolder || DIST_FOLDER;
        data.srcFolder = data.srcFolder || SRC_FOLDER;
        Logger.log(`Adding ZIP comment`, true);
        artifact.addZipComment(`TRM Package`);
        var binaries: {
            trkorr: TRKORR,
            type?: TrmTransportIdentifier,
            binaries: BinaryTransport,
            filenames: FileNames,
            entries: any
        }[] = [];
        var packedTransports: {
            filename: string,
            binary: Buffer,
            comment?: string,
        }[] = [];
        for (const transport of data.transports) {
            Logger.log(`Downloading transport ${transport.trmIdentifier}`, true);
            const trBinary = await transport.download();
            const trEntries = await transport.getEntries();
            binaries.push({
                trkorr: transport.trkorr,
                type: transport.trmIdentifier,
                binaries: trBinary.binaries,
                filenames: trBinary.filenames,
                entries: trEntries
            });
        }
        for (const bin of binaries) {
            const packedTransport = new AdmZip.default();
            Logger.log(`Packing header and data in single file`, true);
            packedTransport.addZipComment(`Transport request: ${bin.trkorr}\nContent type: ${bin.type || 'Unknown'}`);
            packedTransport.addFile(bin.filenames.header, bin.binaries.header, "header");
            packedTransport.addFile(bin.filenames.data, bin.binaries.data, "data");
            packedTransport.addFile(`${bin.trkorr}.JSON`, Buffer.from(JSON.stringify(bin.entries, null, 2), 'utf8'), "entries");
            packedTransports.push({
                filename: bin.trkorr,
                binary: packedTransport.toBuffer(),
                comment: bin.type ? bin.type : ''
            });
        }

        for (const file of packedTransports) {
            Logger.log(`Adding packed transport ${file.comment} to artifact`, true);
            artifact.addFile(`${data.distFolder}/${file.filename}`, file.binary, file.comment);
        }

        data.manifest.setDistFolder(data.distFolder);

        if (data.sourceCode) {
            Logger.log(`Adding source code`, true);
            try {
                if (data.srcFolder === data.distFolder) {
                    throw new Error(`Source code folder and build folder are identical.`);
                }
                const sourceCode = new AdmZip.default(data.sourceCode);
                sourceCode.forEach((entry) => {
                    artifact.addFile(`${data.srcFolder}/${entry.rawEntryName}`, entry.getData(), `ABAPGIT`);
                });
                data.manifest.setSrcFolder(data.srcFolder);
            } catch (e) {
                Logger.error(e.toString(), true);
                Logger.error(`Couldn't add source code to TRM artifact!`);
            }
        }

        const oSapEntries = data.manifest.get().sapEntries;
        const manifestBuffer = Buffer.from(data.manifest.getJSON(["sapEntries"]), 'utf8');
        Logger.log(`Adding manifest.json`, true);
        artifact.addFile(`manifest.json`, manifestBuffer, `manifest`);
        if (oSapEntries && Object.keys(oSapEntries).length > 0) {
            const sapEntriesBuffer = Buffer.from(JSON.stringify(oSapEntries, null, 2), 'utf8');
            Logger.log(`Adding sap_entries.json`, true);
            artifact.addFile(`sap_entries.json`, sapEntriesBuffer, `sap_entries`);
        }

        return new TrmArtifact(
            artifact.toBuffer(),
            data.distFolder,
            data.manifest
        );
    }
}