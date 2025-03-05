import { AuthenticationType, MessageType, Ping, Release, UserAuthorization, View, WhoAmI } from "trm-registry-types";
import { AbstractRegistry } from "./AbstractRegistry";
import { RegistryType } from "./RegistryType";
import { TrmArtifact } from "../trmPackage";
import { userInfo } from "os";
import { existsSync, readFileSync } from "fs";
import { parse as parsePath } from "path";
import { Manifest, TrmManifest } from "../manifest";
import { satisfies } from "semver";
import { writeFile } from "fs/promises";

export const LOCAL_RESERVED_KEYWORD = 'local';

export class FileSystem implements AbstractRegistry {
    endpoint: string;
    name: string;

    private _trmArtifact: TrmArtifact = undefined;
    private _manifest: Manifest = undefined;
    private _trmManifest: TrmManifest = undefined;

    constructor(private _filePath?: string) {
        if (this._filePath) {
            this.endpoint = parsePath(this._filePath).dir;
            this.name = parsePath(this._filePath).base;
            if (!this.endpoint) {
                throw new Error(`Couldn't determine file directory.`);
            }
            if (!this.name) {
                throw new Error(`Couldn't determine file name.`);
            }
        }
    }

    public compare(registry: AbstractRegistry): boolean {
        /*if(registry instanceof Registry){
            return this.endpoint === registry.endpoint;
        }else{
            return false;
        }*/
        return false;
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
                authenticationType: AuthenticationType.NO_AUTH,
                wallMessage: {
                    text: `File system: "${this.name}", "${this.endpoint}"`,
                    type: MessageType.INFO
                }
            };
        }
    }

    public async whoAmI(): Promise<WhoAmI> {
        if (this._filePath) {
            return {
                username: userInfo().username
            }
        }
    }

    public async packageExists(name: string, version?: string): Promise<boolean> {
        if (this._filePath) {
            try {
                if (existsSync(this._filePath)) {
                    if (this._trmArtifact === undefined) {
                        this._trmArtifact = new TrmArtifact(readFileSync(this._filePath));;
                    }
                    if (this._trmArtifact && this._manifest === undefined) {
                        this._manifest = this._trmArtifact.getManifest();
                    }
                    if (this._manifest && this._trmManifest === undefined) {
                        this._trmManifest = this._manifest.get();
                    }
                    if (this._trmManifest) {
                        if (version) {
                            if (this._trmManifest.name === name && version.toLowerCase().trim() === 'latest') {
                                return true;
                            } else {
                                return this._trmManifest.name === name && satisfies(this._trmManifest.version, version);
                            }
                        } else {
                            return true;
                        }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            } catch (e) {
                return false;
            }
        }
    }

    private async checkPackageExists(name: string, version?: string): Promise<void> {
        if (this._filePath) {
            if (!(await this.packageExists(name, version))) {
                throw new Error(`Package doesn't exist.`);
            }
        }
    }

    public async view(name: string, version: string = 'latest'): Promise<View> {
        if (this._filePath) {
            const userAuthorizations: UserAuthorization = {
                canCreateReleases: true
            };
            try {
                await this.checkPackageExists(name, version);
                return {
                    name: this._trmManifest.name,
                    git: this._trmManifest.git,
                    license: this._trmManifest.git,
                    private: this._trmManifest.private,
                    shortDescription: this._trmManifest.description,
                    website: this._trmManifest.website,
                    release: {
                        version: this._trmManifest.version,
                        deprecated: false,
                        latest: true
                    },
                    userAuthorizations
                }
            } catch (e) {
                e.response = {
                    userAuthorizations
                };
                throw e;
            }
        }
    }

    public async getArtifact(name: string, version: string = 'latest'): Promise<TrmArtifact> {
        if (this._filePath) {
            await this.checkPackageExists(name, version);
            return this._trmArtifact;
        }
    }

    public async publishArtifact(packageName: string, version: string, artifact: TrmArtifact, readme?: string): Promise<void> {
        if (this._filePath) {
            return writeFile(this._filePath, artifact.binary, {
                flag: 'w'
            });
        }
    }

    public async unpublish(packageName: string, version: string): Promise<void> {
        if (this._filePath) {
            await this.checkPackageExists(packageName, version);
        }
    }

    public async getReleases(packageName: string, versionRange: string): Promise<Release[]> {
        if (this._filePath) {
            await this.checkPackageExists(packageName, versionRange);
            return [{
                version: this._trmManifest.version,
                deprecated: false,
                latest: true
            }];
        }
    }

}