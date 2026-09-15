import { AS4TEXT, TRKORR, TransportEntries } from "../client";
import { Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { BinaryTransport, FileNames, Transport, TrmTransportIdentifier } from "../transport";
import * as AdmZip from "adm-zip";
import { TransportBinary } from "./TransportBinary";
import { normalize } from "../commons";

const DIST_FOLDER = 'dist';
const SRC_FOLDER = 'src';
export const TRANSPORT_INDEX_FILE = 'transport_index.json';

export type TransportIndexEntry = {
    trkorr: TRKORR,
    type: TrmTransportIdentifier,
    description: AS4TEXT
};

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
                const trmManifest = Manifest.normalize(jsonManifest);
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

    public getTransportIndex(): TransportIndexEntry[] {
        const matches = this._zip.getEntries().filter(entry => entry.entryName === TRANSPORT_INDEX_FILE);
        if (matches.length !== 1) {
            throw new Error(`Artifact is missing a unique ${TRANSPORT_INDEX_FILE}. Republish the package with a current TRM version.`);
        }
        let value: unknown;
        try {
            value = JSON.parse(matches[0].getData().toString('utf8'));
        } catch (error) {
            throw new Error(`Artifact ${TRANSPORT_INDEX_FILE} is malformed. Republish the package with a current TRM version.`);
        }
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error(`Artifact ${TRANSPORT_INDEX_FILE} is incomplete. Republish the package with a current TRM version.`);
        }
        const allowed = new Set(Object.values(TrmTransportIdentifier));
        const seen = new Set<string>();
        for (const item of value) {
            if (!item || typeof item.trkorr !== 'string' || !item.trkorr || !allowed.has(item.type) || typeof item.description !== 'string' || seen.has(item.trkorr)) {
                throw new Error(`Artifact ${TRANSPORT_INDEX_FILE} contains invalid or duplicate transports. Republish the package with a current TRM version.`);
            }
            seen.add(item.trkorr);
        }
        return value as TransportIndexEntry[];
    }

    public async getTransportBinaries(): Promise<TransportBinary[]> {
        if (this._transportBinaries === undefined) {
            const distFolder = this.getDistFolder();
            if (!distFolder) {
                throw new Error(`Unable to locate dist folder.`);
            }
            const zipEntries = this._zip.getEntries();
            const transportBinaries: TransportBinary[] = [];
            const index = this.getTransportIndex();
            const packedEntries = zipEntries.filter(o => o.entryName.startsWith(`${distFolder}/`) && !o.isDirectory);
            if (packedEntries.length !== index.length) {
                throw new Error(`Artifact transport files do not match ${TRANSPORT_INDEX_FILE}. Republish the package.`);
            }
            for (const metadata of index) {
                try {
                    const matches = packedEntries.filter(entry => entry.name === metadata.trkorr);
                    if (matches.length !== 1 || matches[0].comment !== metadata.type) {
                        throw new Error(`Packed transport ${metadata.trkorr} does not match its index entry`);
                    }
                    const entry = matches[0];
                    const zippedTransport = new AdmZip.default(entry.getData());
                    const header = zippedTransport.getEntries().find(o => o.comment === 'header');
                    const data = zippedTransport.getEntries().find(o => o.comment === 'data');
                    const entryFiles = zippedTransport.getEntries().filter(o => o.comment === 'entries' && o.name === `${metadata.trkorr}.JSON`);
                    if (!header || !data || entryFiles.length !== 1) {
                        throw new Error(`Packed transport ${metadata.trkorr} is incomplete`);
                    }
                    const transportEntries = JSON.parse(entryFiles[0].getData().toString());
                    if (!transportEntries || !Array.isArray(transportEntries.e071) || transportEntries.e071.length === 0 ||
                        !Array.isArray(transportEntries.tdevc) || !Array.isArray(transportEntries.tdevct) || !Array.isArray(transportEntries.tadir)) {
                        throw new Error(`Packed transport ${metadata.trkorr} has incomplete entries`);
                    }
                    transportBinaries.push({
                        trkorr: metadata.trkorr,
                        type: metadata.type,
                        entries: normalize(transportEntries) as TransportEntries,
                        binaries: {
                            header: header.getData(),
                            data: data.getData()
                        }
                    });
                } catch (e) {
                    Logger.error(`Malformed artifact!`, true);
                    Logger.error(e.toString(), true);
                    throw new Error(`Artifact transport ${metadata.trkorr} is malformed. Republish the package with a current TRM version.`);
                }
            }
            this._transportBinaries = transportBinaries;
        }
        return this._transportBinaries;
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
            entries: TransportEntries,
            description: AS4TEXT
        }[] = [];
        var packedTransports: {
            filename: string,
            binary: Buffer,
            comment?: string,
        }[] = [];
        for (const transport of data.transports) {
            if (!transport.trmIdentifier || !Object.values(TrmTransportIdentifier).includes(transport.trmIdentifier)) {
                throw new Error(`Transport ${transport.trkorr} has no valid TRM transport type.`);
            }
            Logger.log(`Downloading transport ${transport.trmIdentifier}`, true);
            const trBinary = await transport.download();
            const entries = await transport.getEntries();
            if (!entries || !Array.isArray(entries.e071) || entries.e071.length === 0 ||
                !Array.isArray(entries.tdevc) || !Array.isArray(entries.tdevct) || !Array.isArray(entries.tadir)) {
                throw new Error(`Transport ${transport.trkorr} returned incomplete entries.`);
            }
            binaries.push({
                trkorr: transport.trkorr,
                type: transport.trmIdentifier,
                binaries: trBinary.binaries,
                filenames: trBinary.filenames,
                entries,
                description: await transport.getDescription()
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

        artifact.addFile(TRANSPORT_INDEX_FILE, Buffer.from(JSON.stringify(binaries.map(bin => ({
            trkorr: bin.trkorr,
            type: bin.type,
            description: bin.description
        })), null, 2), 'utf8'));

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
