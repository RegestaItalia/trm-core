import { TRKORR } from "../client";
import { Manifest } from "../manifest";
import { BinaryTransport, FileNames, Transport, TrmTransportIdentifier } from "../transport";
import * as AdmZip from "adm-zip";
import { R3trans } from "node-r3trans";

const DIST_FOLDER = 'dist';

export class TrmArtifact {
    private _zip: AdmZip;

    constructor(public binary: Buffer, private _distFolder?: string, private _manifest?: Manifest) {
        this._zip = new AdmZip.default(binary);
    }

    public getManifest(): Manifest | null {
        if(this._manifest === undefined){
            const zipEntries = this._zip.getEntries();
            const manifestEntry = zipEntries.find(o => o.entryName.trim().toLowerCase() === 'manifest.json');
            if(!manifestEntry){
                this._manifest = null;
            }else{
                this._manifest = Manifest.fromJson(manifestEntry.getData().toString());
            }
        }
        return this._manifest;
    }

    public replaceManifest(oManifest: Manifest) {
        const manifestBuffer = Buffer.from(JSON.stringify(oManifest.get(false), null, 2), 'utf8');
        this._zip.updateFile('manifest.json', manifestBuffer);
    }

    public getDistFolder(): string | null {
        if(!this._distFolder){
            this._distFolder = this.getManifest()?.get().distFolder;
        }
        return this._distFolder;
    }

    public async getTransportBinaries(tmpFolder?: string): Promise<{
        trkorr: TRKORR,
        type?: TrmTransportIdentifier,
        binaries: BinaryTransport
    }[]>{
        const distFolder = this.getDistFolder();
        if(!distFolder){
            throw new Error(`Couldn't locate dist folder.`);
        }
        const zipEntries = this._zip.getEntries();
        const aTransportEntries = zipEntries.filter(o => o.entryName.trim().toLowerCase().startsWith(`${distFolder}/`));
        var aResult = [];
        const r3trans = new R3trans({
            tempDirPath: tmpFolder
        });
        for(const entry of aTransportEntries){
            try{
                const type = entry.comment;
                const oPackedTransport = new AdmZip.default(entry.getData());
                const aPackedTransportEntries = oPackedTransport.getEntries();
                const oHeader = aPackedTransportEntries.find(o => o.comment === 'header')?.getData();
                const oData = aPackedTransportEntries.find(o => o.comment === 'data')?.getData();
                if(oHeader && oData){
                    const trkorr = await r3trans.getTransportTrkorr(oData);
                    aResult.push({
                        trkorr,
                        type,
                        binaries: {
                            header: oHeader,
                            data: oData
                        }
                    });
                }
            }catch(e){ }
        };
        return aResult;
    }

    public static async create(transports: Transport[], manifest: Manifest, skipLog: boolean = false, distFolder: string = DIST_FOLDER): Promise<TrmArtifact> {
        const artifact = new AdmZip.default();
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
        for(const transport of transports){
            const trBinary = await transport.download(skipLog);
            binaries.push({
                trkorr: transport.trkorr,
                type: transport.trmIdentifier,
                binaries: trBinary.binaries,
                filenames: trBinary.filenames
            });
        }
        for(const bin of binaries){
            const packedTransport = new AdmZip.default();
            packedTransport.addZipComment(`Transport request: ${bin.trkorr}\nContent type: ${bin.type || 'Unknown'}`);
            packedTransport.addFile(bin.filenames.header, bin.binaries.header, "header");
            packedTransport.addFile(bin.filenames.data, bin.binaries.data, "data");
            packedTransports.push({
                filename: bin.trkorr,
                binary: packedTransport.toBuffer(),
                comment: bin.type ? bin.type : ''
            });
        }
        
        for(const file of packedTransports){
            artifact.addFile(`${distFolder}/${file.filename}`, file.binary, file.comment);
        }

        manifest.setDistFolder(distFolder);
        const manifestBuffer = Buffer.from(JSON.stringify(manifest.get(false), null, 2), 'utf8');
        artifact.addFile(`manifest.json`, manifestBuffer, `manifest`);

        return new TrmArtifact(artifact.toBuffer(), distFolder, manifest);
    }
}