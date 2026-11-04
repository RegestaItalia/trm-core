import { AuthenticationType, BatchCompareResponse, MessageType, Namespace, Package, PackageInfo, PackageManifest, Ping, Readme, Search, SearchRequest, WhoAmI } from "trm-registry-types";
import { AbstractRegistry } from "./AbstractRegistry";
import { RegistryType } from "./RegistryType";
import { TrmArtifact, TrmPackage } from "../trmPackage";
import { userInfo } from "os";
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync } from "fs";
import { parse as parsePath } from "path";
import { writeFile } from "fs/promises";
import { BinaryTransport } from "../transport";
import { DeleteTransportOptions, DeletionTransport } from "./DeletionTransport";
import { createHash } from "crypto";
import { TransportEntries } from "../client";
import { RegistryPackageNotFoundError } from "./RegistryPackageNotFoundError";
import { RegistryDeletionTransportUnavailableError } from "./RegistryDeletionTransportUnavailableError";
import { ReleaseDiffReport } from "./ReleaseDiff";
import { RegistryDiffError } from "./RegistryDiffError";
import { Manifest, TrmManifest } from "../manifest";

export const LOCAL_RESERVED_KEYWORD = 'local';

export class FileSystem implements AbstractRegistry {
    endpoint: string;
    name: string = LOCAL_RESERVED_KEYWORD;
    private _artifact: TrmArtifact;

    constructor(private _filePath?: string) {
        if (this._filePath) {
            this.endpoint = parsePath(this._filePath).dir;
            this.name = parsePath(this._filePath).base;
            if (this.name === this._filePath) {
                throw new Error(`"${this._filePath}" is not a valid file path.`);
            }
            if (!this.endpoint) {
                throw new Error(`Couldn't determine file directory.`);
            }
            if (!this.name) {
                throw new Error(`Couldn't determine file name.`);
            }
            if (existsSync(this._filePath) && lstatSync(this._filePath).isDirectory()) {
                throw new Error(`"${this._filePath}" is a directory. File name is missing.`);
            }
            if (existsSync(this.endpoint)) {
                if (!lstatSync(this.endpoint).isDirectory()) {
                    throw new Error(`"${this.endpoint}" is not a valid directory.`);
                } else {
                    try {
                        accessSync(this.endpoint, constants.W_OK)
                    } catch (e) {
                        throw new Error(`Cannot write to directory "${this.endpoint}".`);
                    }
                }
            } else {
                mkdirSync(this.endpoint, { recursive: true });
            }
        }
    }

    public compare(registry: AbstractRegistry): boolean {
        if (registry instanceof FileSystem) {
            return this._filePath === registry._filePath;
        } else {
            return false;
        }
    }

    public getRegistryType(): RegistryType {
        return RegistryType.LOCAL;
    }

    public async authenticate(): Promise<AbstractRegistry> {
        return this;
    }

    public getAuthData(): any {
        return null;
    }

    public async ping(): Promise<Ping> {
        if (this._filePath) {
            return {
                authentication_type: AuthenticationType.NO_AUTH,
                messages: [{
                    text: `File system: "${this.name}", "${this.endpoint}"`,
                    type: MessageType.INFO
                }]
            };
        }
        throw new Error(`Missing file path!`);
    }

    public async whoAmI(): Promise<WhoAmI> {
        if (this._filePath) {
            return {
                user: userInfo().username
            }
        }
        throw new Error(`Missing file path!`);
    }

    public async getPackage(fullName: string, version: string): Promise<Package> {
        if (this._filePath) {
            if (!existsSync(this._filePath)) {
                throw new RegistryPackageNotFoundError(fullName, version, this._filePath, undefined);
            }
            const artifact = await this.getArtifact();
            const manifest = artifact.getManifest();
            const transportIndex = artifact.getTransportIndex();
            const transportBinaries = await artifact.getTransportBinaries();
            return {
                name: fullName,
                dist_tags: {
                    latest: version
                },
                versions: [],
                yanked_versions: [],
                deprecated: false,
                manifest: manifest ? manifest.get() : undefined,
                checksum: createHash('sha512').update(artifact.binary).digest('base64'),
                download_link: this._filePath,
                transports: transportIndex.map(transport => ({
                    ...transport,
                    contents: {
                        download_link: this._filePath,
                        checksum: transportBinaries.find(item => item.trkorr === transport.trkorr).entriesChecksum
                    }
                }))
            }
        }
        throw new Error(`File system can't view packages!`);
    }

    public async downloadArtifact(): Promise<TrmArtifact> {
        return new TrmArtifact(readFileSync(this._filePath));
    }

    public async getArtifact(): Promise<TrmArtifact> {
        if (this._filePath) {
            try {
                if (!this._artifact) {
                    this._artifact = new TrmArtifact(readFileSync(this._filePath));
                    this._artifact.setFilePath(this._filePath);
                }
                return this._artifact;
            } catch (e) {
                throw new Error(`File system couldn't read package. The artifact may be incomplete or legacy; republish it with a current TRM version.`);
            }
        }
        throw new Error(`Missing file path!`);
    }

    public async validatePublish(): Promise<void> {
        //always valid, already checked in contructor
    }

    public async publish(fullName: string, version: string, artifact: TrmArtifact): Promise<void> {
        if (this._filePath) {
            await writeFile(this._filePath, artifact.binary, {
                flag: 'w'
            });
            return;
        }
        throw new Error(`Missing file path!`);
    }

    public async unpublish(): Promise<void> {
        throw new Error(`File system can't delete packages!`);
    }

    public async deprecate(): Promise<void> {
        throw new Error(`File system can't deprecate packages!`);
    }

    public async addDistTag(): Promise<void> {
        throw new Error(`File system can't add dist tags!`);
    }

    public async rmDistTag(): Promise<void> {
        throw new Error(`File system can't remove dist tags!`);
    }

    public async diff(): Promise<ReleaseDiffReport> {
        throw new RegistryDiffError(this.endpoint, `File system can't compare releases!`, 501);
    }

    public async batchCompare(): Promise<BatchCompareResponse> {
        throw new Error(`File system cannot compare package versions in registry!`);
    }

    public async transport(): Promise<BinaryTransport>{
        throw new Error(`File system can't fetch transports!`);
    }

    public async transportEntries(_fullName: string, _version: string, trkorr: string): Promise<TransportEntries> {
        const transport = (await (await this.getArtifact()).getTransportBinaries()).find(item => item.trkorr === trkorr);
        if (!transport) {
            throw new Error(`Transport ${trkorr} was not found in the local artifact.`);
        }
        return transport.entries;
    }

    public async delete(_transport: BinaryTransport, _options?: DeleteTransportOptions): Promise<DeletionTransport> {
        throw new RegistryDeletionTransportUnavailableError(LOCAL_RESERVED_KEYWORD, `Local packages (.trm files) can't generate deletion transports.`);
    }

    /** Manifest of the local artifact, `undefined` when there is no artifact file. */
    private async getLocalManifest(): Promise<TrmManifest | undefined> {
        if (!this._filePath) {
            throw new Error(`Missing file path!`);
        }
        if (!existsSync(this._filePath)) {
            return undefined;
        }
        const manifest = (await this.getArtifact()).getManifest();
        return manifest ? manifest.get() : undefined;
    }

    /**
     * Manifest of the local artifact for a package navigation read: like {@link getPackage}, the artifact
     * is the only release, whatever name and version are requested.
     */
    private async getNavigationManifest(fullName: string, version: string): Promise<TrmManifest> {
        const manifest = await this.getLocalManifest();
        if (!manifest) {
            throw new RegistryPackageNotFoundError(fullName, version, this._filePath, undefined);
        }
        return manifest;
    }

    private static getKeywords(manifest: TrmManifest): string[] {
        if (typeof manifest.keywords === 'string') {
            return Manifest.stringKeywordsToArray(manifest.keywords);
        }
        return Array.isArray(manifest.keywords) ? manifest.keywords : [];
    }

    private getReleaseDate(): string {
        try {
            return lstatSync(this._filePath).mtime.toISOString();
        } catch {
            return new Date(0).toISOString();
        }
    }

    public async search(req: SearchRequest): Promise<Search> {
        const limit = Math.min(25, Math.max(1, Math.floor(req?.limit || 25)));
        const page = Math.max(1, Math.floor(req?.page || 1));
        const manifest = await this.getLocalManifest();
        const matches: TrmManifest[] = [];
        if (manifest) {
            const q = (req?.q || '').trim().toLowerCase();
            const keywords = FileSystem.getKeywords(manifest).map(k => k.toLowerCase());
            const organization = /^@([^/]+)\//.exec(manifest.name || '')?.[1]?.toLowerCase();
            const textMatch = !q || (manifest.name || '').toLowerCase().includes(q) || (manifest.description || '').toLowerCase().includes(q);
            const keywordsMatch = (req?.keywords || []).every(k => keywords.includes(k.toLowerCase()));
            const organizationsMatch = !req?.organizations?.length
                || req.organizations.some(o => o.replace(/^@/, '').toLowerCase() === organization);
            // a local artifact has no registry maintainers
            const maintainersMatch = !req?.maintainers?.length;
            if (textMatch && keywordsMatch && organizationsMatch && maintainersMatch) {
                matches.push(manifest);
            }
        }
        const releaseDate = this.getReleaseDate();
        return {
            total: matches.length,
            page,
            limit,
            results: matches.slice((page - 1) * limit, page * limit).map(m => ({
                name: m.name,
                version: m.version,
                description: m.description,
                license: m.license,
                maintainers: [],
                release_date: releaseDate,
                downloads: 0,
                private: !!m.private
            }))
        };
    }

    public async getPackageInfo(fullName: string, version: string = 'latest'): Promise<PackageInfo> {
        const manifest = await this.getNavigationManifest(fullName, version);
        const releaseDate = this.getReleaseDate();
        return {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            license: manifest.license,
            release_date: releaseDate,
            private: !!manifest.private,
            deprecated: false,
            website: manifest.website,
            git: manifest.git,
            keywords: FileSystem.getKeywords(manifest),
            maintainers: [],
            downloads: 0,
            versions: [manifest.version],
            version_dates: { [manifest.version]: releaseDate },
            yanked_versions: [],
            dist_tags: { latest: manifest.version },
            dependencies: (manifest.dependencies || []).map(d => ({ name: d.name, version: d.version })),
            has_namespace: !!manifest.namespace?.ns
        };
    }

    public async getReadme(fullName: string, version: string = 'latest'): Promise<Readme> {
        const manifest = await this.getNavigationManifest(fullName, version);
        // .trm artifacts don't embed a README
        return { name: manifest.name, version: manifest.version, readme: null };
    }

    public async getManifest(fullName: string, version: string = 'latest'): Promise<PackageManifest> {
        const manifest = await this.getNavigationManifest(fullName, version);
        return { name: manifest.name, version: manifest.version, manifest };
    }

    public async getNamespace(fullName: string, version: string = 'latest'): Promise<Namespace> {
        const manifest = await this.getNavigationManifest(fullName, version);
        if (!manifest.namespace?.ns) {
            throw new RegistryPackageNotFoundError(fullName, version, this._filePath, undefined);
        }
        return {
            namespace: manifest.namespace.ns,
            descriptions: (manifest.namespace.texts || []).map(t => ({
                language: t.language,
                description: t.description,
                ...(t.owner ? { owner: t.owner } : {})
            }))
        };
    }

    /**
     * Returns the package of the local artifact, with the registry it was published to.
     */
    public async getRealPackage(): Promise<TrmPackage> {
        if (this._filePath) {
            try {
                const artifact = await this.getArtifact();
                return artifact.getManifest().getPackage();
            } catch (e) {
                throw new Error(`File system couldn't read package`);
            }
        }
        throw new Error(`Missing file path!`);
    }

    public async getRealRegistry(): Promise<AbstractRegistry> {
        return (await this.getRealPackage()).registry;
    }

}
