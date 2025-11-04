import { AuthenticationType, Deprecate, DistTagAdd, DistTagRm, MessageType, Package, Ping, WhoAmI } from "trm-registry-types";
import { AbstractRegistry } from "./AbstractRegistry";
import { RegistryType } from "./RegistryType";
import { TrmArtifact } from "../trmPackage";
import { userInfo } from "os";
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync } from "fs";
import { parse as parsePath } from "path";
import { writeFile } from "fs/promises";

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

    public async authenticate(defaultData: any): Promise<AbstractRegistry> {
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
            return {
                name: fullName,
                dist_tags: {
                    latest: version
                },
                versions: [],
                yanked_versions: [],
                deprecated: false,
                manifest: null,
                checksum: null,
                download_link: this._filePath
            }
        }
        throw new Error(`File system can't view packages!`);
    }

    public async downloadArtifact(fullName: string, version: string): Promise<TrmArtifact> {
        return new TrmArtifact(readFileSync(this._filePath));
    }

    public async getArtifact(name: string, version: string = 'latest'): Promise<TrmArtifact> {
        if (this._filePath) {
            try {
                if (!this._artifact) {
                    this._artifact = new TrmArtifact(readFileSync(this._filePath));
                    this._artifact.setFilePath(this._filePath);
                }
                return this._artifact;
            } catch (e) {
                throw new Error(`File system couldn't read package`);
            }
        }
        throw new Error(`Missing file path!`);
    }

    public async validatePublish(fullName: string, version: string): Promise<void> {
        //always valid, already checked in contructor
    }

    public async publish(fullName: string, version: string, artifact: TrmArtifact, readme?: string): Promise<Package> {
        if (this._filePath) {
            await writeFile(this._filePath, artifact.binary, {
                flag: 'w'
            });
            return this.getPackage(fullName, version);
        }
        throw new Error(`Missing file path!`);
    }

    public async unpublish(fullName: string, version: string): Promise<void> {
        throw new Error(`File system can't delete packages!`);
    }

    public async deprecate(fullName: string, version: string, deprecate: Deprecate): Promise<void> {
        throw new Error(`File system can't deprecate packages!`);
    }

    public async addDistTag(fullName: string, distTag: DistTagAdd): Promise<void> {
        throw new Error(`File system can't add dist tags!`);
    }

    public async rmDistTag(fullName: string, distTag: DistTagRm): Promise<void> {
        throw new Error(`File system can't remove dist tags!`);
    }

}