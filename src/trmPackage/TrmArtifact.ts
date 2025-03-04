import { TRKORR } from "../client";
import { Logger } from "../logger";
import { Manifest } from "../manifest";
import { BinaryTransport, FileNames, Transport, TrmTransportIdentifier } from "../transport";
import * as AdmZip from "adm-zip";
import { R3trans, R3transOptions } from "node-r3trans";
import { TransportBinary } from "./TransportBinary";

const DIST_FOLDER = 'dist';
const SRC_FOLDER = 'src';

export class TrmArtifact {
    private _zip: AdmZip;
    private _binaries: TransportBinary[];
    private _content: any;

    constructor(public binary: Buffer, private _distFolder?: string, private _srcFolder?: string, private _manifest?: Manifest) {
        this._zip = new AdmZip.default(binary);
    }

    public getManifest(): Manifest | null {
        if (this._manifest === undefined) {
            const zipEntries = this._zip.getEntries();
            const manifestEntry = zipEntries.find(o => o.entryName.trim().toLowerCase() === 'manifest.json');
            const sapEntriesEntry = zipEntries.find(o => o.entryName.trim().toLowerCase() === 'sap_entries.json');
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
                this._manifest = new Manifest(trmManifest);
            }
        }
        return this._manifest;
    }

    public replaceManifest(oManifest: Manifest) {
        const manifestBuffer = Buffer.from(JSON.stringify(oManifest.get(false), null, 2), 'utf8');
        this._zip.updateFile('manifest.json', manifestBuffer);
    }

    public getDistFolder(): string | null {
        if (!this._distFolder) {
            this._distFolder = this.getManifest()?.get().distFolder;
        }
        return this._distFolder;
    }

    public async getTransportBinaries(r3transOption?: R3transOptions): Promise<TransportBinary[]> {
        if (!this._binaries) {
            const distFolder = this.getDistFolder();
            if (!distFolder) {
                throw new Error(`Couldn't locate dist folder.`);
            }
            const zipEntries = this._zip.getEntries();
            const aTransportEntries = zipEntries.filter(o => (new RegExp(`^${distFolder}(/|\\\\)`)).test(o.entryName.trim().toLowerCase()));
            var aResult: TransportBinary[] = [];
            const r3trans = new R3trans(r3transOption);
            for (const entry of aTransportEntries) {
                try {
                    const type = entry.comment;
                    const oPackedTransport = new AdmZip.default(entry.getData());
                    const aPackedTransportEntries = oPackedTransport.getEntries();
                    const oHeader = aPackedTransportEntries.find(o => o.comment === 'header')?.getData();
                    const oData = aPackedTransportEntries.find(o => o.comment === 'data')?.getData();
                    if (oHeader && oData) {
                        const trkorr = await r3trans.getTransportTrkorr(oData);
                        aResult.push({
                            trkorr,
                            type: type as TrmTransportIdentifier,
                            binaries: {
                                header: oHeader,
                                data: oData
                            }
                        });
                    }
                } catch (e) { }
            };
            this._binaries = aResult;
        }
        return this._binaries || [];
    }

    public async getContent(r3transConfig?: R3transOptions): Promise<any> {
        if (!this._content) {
            this._content = {};
            try {
                const transportBinaries = await this.getTransportBinaries();
                const r3trans = new R3trans(r3transConfig);
                for (const transportBinary of transportBinaries) {
                    const tableEntries = await r3trans.getTableEntries(transportBinary.binaries.data);
                    if (!this._content[transportBinary.type]) {
                        this._content[transportBinary.type] = {
                            trkorr: transportBinary.trkorr,
                            content: {}
                        };
                    }
                    Object.keys(tableEntries).forEach(table => {
                        if (!this._content[transportBinary.type].content[table]) {
                            this._content[transportBinary.type].content[table] = [];
                        }
                        this._content[transportBinary.type].content[table] = this._content[transportBinary.type].content[table].concat(tableEntries[table]);
                    });
                }
            } catch (e) {
                delete this._content;
                throw e;
            }
        }
        return this._content || {};
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
            filenames: FileNames
        }[] = [];
        var packedTransports: {
            filename: string,
            binary: Buffer,
            comment?: string,
        }[] = [];
        for (const transport of data.transports) {
            Logger.log(`Downloading transport ${transport.trmIdentifier}`, true);
            const trBinary = await transport.download();
            binaries.push({
                trkorr: transport.trkorr,
                type: transport.trmIdentifier,
                binaries: trBinary.binaries,
                filenames: trBinary.filenames
            });
        }
        for (const bin of binaries) {
            const packedTransport = new AdmZip.default();
            Logger.log(`Packing header and data in single file`, true);
            packedTransport.addZipComment(`Transport request: ${bin.trkorr}\nContent type: ${bin.type || 'Unknown'}`);
            packedTransport.addFile(bin.filenames.header, bin.binaries.header, "header");
            packedTransport.addFile(bin.filenames.data, bin.binaries.data, "data");
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

        if(data.sourceCode){
            Logger.log(`Adding source code`, true);
            try{
                if(data.srcFolder === data.distFolder){
                    throw new Error(`Source code folder and build folder are identical.`);
                }
                const sourceCode = new AdmZip.default(data.sourceCode);
                sourceCode.forEach((entry) => {
                    artifact.addFile(`${data.srcFolder}/${entry.rawEntryName}`, entry.getData(), `ABAPGIT`);
                });
                data.manifest.setSrcFolder(data.srcFolder);
            }catch(e){
                Logger.error(e.toString(), true);
                Logger.error(`Couldn't add source code to TRM artifact!`);
            }
        }

        var oManifest = data.manifest.get(false);
        var oSapEntries = oManifest.sapEntries;
        delete oManifest.sapEntries;

        const manifestBuffer = Buffer.from(JSON.stringify(oManifest, null, 2), 'utf8');
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
            data.srcFolder,
            data.manifest
        );
    }
}