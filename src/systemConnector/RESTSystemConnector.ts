import { Logger } from "../logger";
import { DEVCLASS } from "../client/components";
import { TADIR } from "../client/struct";
import { Login } from "./Login";
import { ISystemConnector } from "./ISystemConnector";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { SystemConnectorBase } from "./SystemConnectorBase";
import { RESTConnection } from "./RESTConnection";

export class RESTSystemConnector extends SystemConnectorBase implements ISystemConnector {

    constructor(private _connection: RESTConnection, private _login: Login) {
        super();
        /*this._login.user = this._login.user.toUpperCase();
        this._lang = this._login.lang;
        this._user = this._login.user;
        if (!this._connection.saprouter) {
            delete this._connection.saprouter;
        }
        this._client = new RFCClient({ ...this._connection, ...this._login });*/
    }
    
    protected getSysname(): string {
        return this.getDest();
    }

    public getDest(): string {
        //return this._connection.dest;
        return null;
    }

    protected getLangu(c: boolean): string {
        return this.getLogonLanguage();
    }

    public getLogonLanguage(c: boolean = false): string {
        /*if (c) {
            return Array.from(this._lang)[0];
        } else {
            return this._lang;
        }*/
        return null;
    }

    protected async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        //return this._client.readTable(tableName, fields, options);
        return null;
    }

    protected async getTrmServerVersion(): Promise<string> {
        //return this._client.getTrmServerVersion();
        return null;
    }

    protected async listDevclassObjects(devclass: DEVCLASS): Promise<TADIR[]> {
        //return this._client.getDevclassObjects(devclass);
        return null;
    }

    protected async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean): Promise<void> {
        //return this._client.tdevcInterface(devclass, parentcl, rmParentCl);
    }

    public getConnectionData(): RESTConnection {
        return this._connection;
    }

    public getLogonUser(): string {
        //return this._user;
        return null;
    }

    public async connect(): Promise<void> {
        /*Logger.loading(`Connecting to ${this.getDest()}...`);
        try {
            await this._client.open();
            Logger.success(`Connected to ${this.getDest()} as ${this._user}.`, false);
        } catch (e) {
            Logger.error(`Connection to ${this.getDest()} as ${this._user} failed.`, false);
            throw e;
        }*/
    }

    public async checkConnection(): Promise<boolean> {
        //return this._client.checkConnection();
        return null;
    }

    public async ping(): Promise<string> {
        //return await this._client.trmServerPing();
        return null;
    }

    public async getFileSystem(): Promise<struct.FILESYS> {
        //return this._client.getFileSystem();
        return null;
    }

    public async getDirTrans(): Promise<components.PFEVALUE> {
        //return this._client.getDirTrans();
        return null;
    }

    public async getBinaryFile(filePath: string): Promise<Buffer> {
        //return this._client.getBinaryFile(filePath);
        return null;
    }

    public async writeBinaryFile(filePath: string, binary: Buffer): Promise<void> {
        //return this._client.writeBinaryFile(filePath, binary);
        return null;
    }

    public async createTocTransport(text: components.AS4TEXT, target: components.TR_TARGET): Promise<components.TRKORR> {
        //return this._client.createTocTransport(text, target);
        return null;
    }

    public async createWbTransport(text: components.AS4TEXT, target?: components.TR_TARGET): Promise<components.TRKORR> {
        //return this._client.createWbTransport(text, target);
        return null;
    }

    public async setTransportDoc(trkorr: components.TRKORR, doc: struct.TLINE[]): Promise<void> {
        //return this._client.setTransportDoc(trkorr, doc);
        return null;
    }

    public async addToTransportRequest(trkorr: components.TRKORR, content: struct.E071[], lock: boolean): Promise<void> {
        //return this._client.addToTransportRequest(trkorr, content, lock);
        return null;
    }

    public async repositoryEnvironment(objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME): Promise<struct.SENVI[]> {
        //return this._client.repositoryEnvironment(objectType, objectName);
        return null;
    }

    public async deleteTrkorr(trkorr: components.TRKORR): Promise<void> {
        //return this._client.deleteTrkorr(trkorr);
        return null;
    }

    public async releaseTrkorr(trkorr: components.TRKORR, lock: boolean, timeout?: number): Promise<void> {
        //return this._client.releaseTrkorr(trkorr, lock, timeout);
        return null;
    }

    public async addSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        //return this._client.addSkipTrkorr(trkorr);
        return null;
    }

    public async addSrcTrkorr(trkorr: components.TRKORR): Promise<void> {
        //return this._client.addSrcTrkorr(trkorr);
        return null;
    }

    public async readTmsQueue(target: components.TMSSYSNAM): Promise<struct.STMSIQREQ[]> {
        //return this._client.readTmsQueue(target);
        return null;
    }

    public async createPackage(scompkdtln: struct.SCOMPKDTLN): Promise<void> {
        //return this._client.createPackage(scompkdtln);
        return null;
    }

    public async getDefaultTransportLayer(): Promise<components.DEVLAYER> {
        //return this._client.getDefaultTransportLayer();
        return null;
    }

    public async tadirInterface(tadir: struct.TADIR): Promise<void> {
        //return this._client.tadirInterface(tadir);
        return null;
    }

    public async dequeueTransport(trkorr: components.TRKORR): Promise<void> {
        //return this._client.dequeueTransport(trkorr);
        return null;
    }

    public async forwardTransport(trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean): Promise<void> {
        //return this._client.forwardTransport(trkorr, target, source, importAgain);
        return null;
    }

    public async importTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        //return this._client.importTransport(trkorr, system);
        return null;
    }

    public async setInstallDevc(installDevc: struct.ZTRM_INSTALLDEVC[]): Promise<void> {
        //return this._client.setInstallDevc(installDevc);
        return null;
    }

    public async getObjectsList(): Promise<struct.KO100[]> {
        //return this._client.getObjectsList();
        return null;
    }

    public async renameTransportRequest(trkorr: components.TRKORR, as4text: components.AS4TEXT): Promise<void> {
        //return this._client.renameTransportRequest(trkorr, as4text);
        return null;
    }

    public async setPackageIntegrity(integrity: struct.ZTRM_INTEGRITY): Promise<void> {
        //return this._client.setPackageIntegrity(integrity);
        return null;
    }

    public async addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void> {
        //return this._client.addTranslationToTr(trkorr, devclassFilter);
        return null;
    }

    public async trCopy(from: components.TRKORR, to: components.TRKORR, doc: boolean): Promise<void> {
        //return this._client.trCopy(from, to, doc);
        return null;
    }

}