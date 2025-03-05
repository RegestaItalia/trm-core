import { AuthenticationType, MessageType, Ping, Release, UserAuthorization, View, WhoAmI } from "trm-registry-types";
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
    name: string;

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
            if (this.name === this._filePath) {
                throw new Error(`"${this._filePath}" is not a valid file path.`);
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
        if(registry instanceof FileSystem){
            return this._filePath === registry._filePath;
        }else{
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
                authenticationType: AuthenticationType.NO_AUTH,
                wallMessage: {
                    text: `File system: "${this.name}", "${this.endpoint}"`,
                    type: MessageType.INFO
                }
            };
        }
        return null;
    }

    public async whoAmI(): Promise<WhoAmI> {
        if (this._filePath) {
            return {
                username: userInfo().username
            }
        }
        return null;
    }

    public async packageExists(name: string, version?: string): Promise<boolean> {
        if (this._filePath) {
            return false;
        }
        return null;
    }

    public async view(name: string, version: string = 'latest'): Promise<View> {
        if (this._filePath) {
            const userAuthorizations: UserAuthorization = {
                canCreateReleases: true
            };
            var error = new Error(`File system can't view packages!`);
            (error as any).response = {
                userAuthorizations
            };
            throw error;
        }
        return null;
    }

    public async getArtifact(name: string, version: string = 'latest'): Promise<TrmArtifact> {
        if (this._filePath) {
            try{
                return new TrmArtifact(readFileSync(this._filePath));
            }catch(e){
                throw new Error(`File system couldn't read package`);
            }
        }
        return null;
    }

    public async publishArtifact(packageName: string, version: string, artifact: TrmArtifact, readme?: string): Promise<void> {
        if (this._filePath) {
            return writeFile(this._filePath, artifact.binary, {
                flag: 'w'
            });
        }
        return null;
    }

    public async unpublish(packageName: string, version: string): Promise<void> {
        throw new Error(`File system can't delete packages!`);
    }

    public async getReleases(packageName: string, versionRange: string): Promise<Release[]> {
        if (this._filePath) {
            return [];
        }
        return null;
    }

}