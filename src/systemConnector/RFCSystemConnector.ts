import { Logger } from "trm-commons";
import { ClientError, RFCClient, RFCClientError, SapMessage } from "../client";
import { DEVCLASS } from "../client/components";
import { TADIR } from "../client/struct";
import { RFCConnection } from "./RFCConnection";
import { Login } from "../client/Login";
import { ISystemConnector } from "./ISystemConnector";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { SystemConnectorBase } from "./SystemConnectorBase";
import { SystemConnectorSupportedBulk } from "./SystemConnectorSupportedBulk";

export class RFCSystemConnector extends SystemConnectorBase implements ISystemConnector {
    private _lang: string;
    private _user: string;
    private _client: RFCClient;
    private _isServerApisAllowed: true | RFCClientError;

    supportedBulk: SystemConnectorSupportedBulk = {
        getTransportObjects: false,
        getExistingObjects: false
    };

    constructor(private _connection: RFCConnection, private _login: Login, private _traceDir?: string) {
        super();
        this._login.user = this._login.user.toUpperCase();
        this._lang = this._login.lang;
        this._user = this._login.user;
        if (!this._connection.saprouter) {
            delete this._connection.saprouter;
        }
        this._client = new RFCClient({ ...this._connection, ...this._login }, this._lang[0], this._traceDir);
    }

    protected getSysname(): string {
        return this.getDest();
    }

    public getDest(): string {
        return this._connection.dest;
    }

    protected getLangu(c: boolean): string {
        return this.getLogonLanguage(c);
    }

    public getLogonLanguage(c: boolean = false): string {
        if (c) {
            return this._lang[0];
        } else {
            return this._lang;
        }
    }

    protected async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        return this._client.readTable(tableName, fields, options);
    }

    protected async getTrmServerVersion(): Promise<string> {
        return this._client.getTrmServerVersion();
    }

    protected async getTrmRestVersion(): Promise<string> {
        return this._client.getTrmRestVersion();
    }

    protected async listDevclassObjects(devclass: DEVCLASS): Promise<TADIR[]> {
        return this._client.getDevclassObjects(devclass);
    }

    protected async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean, devlayer?: components.DEVLAYER): Promise<void> {
        return this._client.tdevcInterface(devclass, parentcl, rmParentCl, devlayer);
    }

    protected async getR3transInfo(): Promise<string> {
        return this._client.getR3transInfo();
    }

    protected getInstalledPackagesBackend(): Promise<struct.ZTY_TRM_PACKAGE[]> {
        return this._client.getInstalledPackagesBackend();
    }

    public getConnectionData(): RFCConnection {
        return this._connection;
    }

    public getLogonUser(): string {
        return this._user;
    }

    public async connect(silent: boolean = false): Promise<void> {
        Logger.loading(`Connecting to ${this.getDest()}...`, silent);
        try {
            await this._client.open();
            Logger.success(`Connected to ${this.getDest()} as ${this._user}.`, silent);
        } catch (e) {
            Logger.error(`Connection to ${this.getDest()} as ${this._user} failed.`, silent);
            throw e;
        }
    }

    public async close(): Promise<void> {
        await this._client.close();
    }

    public async checkConnection(): Promise<boolean> {
        return this._client.checkConnection();
    }

    public async ping(): Promise<string> {
        return this._client.trmServerPing();
    }

    public async getFileSystem(): Promise<struct.FILESYS> {
        return this._client.getFileSystem();
    }

    public async getDirTrans(): Promise<components.PFEVALUE> {
        return this._client.getDirTrans();
    }

    public async getBinaryFile(filePath: string): Promise<Buffer> {
        return this._client.getBinaryFile(filePath);
    }

    public async writeBinaryFile(filePath: string, binary: Buffer): Promise<void> {
        return this._client.writeBinaryFile(filePath, binary);
    }

    public async createTocTransport(text: components.AS4TEXT, target: components.TR_TARGET): Promise<components.TRKORR> {
        return this._client.createTocTransport(text, target);
    }

    public async createWbTransport(text: components.AS4TEXT, target?: components.TR_TARGET): Promise<components.TRKORR> {
        return this._client.createWbTransport(text, target);
    }

    public async setTransportDoc(trkorr: components.TRKORR, doc: struct.TLINE[]): Promise<void> {
        return this._client.setTransportDoc(trkorr, doc);
    }

    public async removeComments(trkorr: components.TRKORR, object: components.TROBJTYPE): Promise<void> {
        return this._client.removeComments(trkorr, object);
    }

    public async addToTransportRequest(trkorr: components.TRKORR, content: struct.E071[], lock: boolean): Promise<void> {
        return this._client.addToTransportRequest(trkorr, content, lock);
    }

    public async repositoryEnvironment(objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME): Promise<struct.SENVI[]> {
        return this._client.repositoryEnvironment(objectType, objectName);
    }

    public async deleteTrkorr(trkorr: components.TRKORR): Promise<void> {
        return this._client.deleteTrkorr(trkorr);
    }

    public async releaseTrkorr(trkorr: components.TRKORR, lock: boolean, timeout?: number): Promise<void> {
        return this._client.releaseTrkorr(trkorr, lock, timeout);
    }

    public async addSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        return this._client.addSkipTrkorr(trkorr);
    }

    public async removeSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        return this._client.removeSkipTrkorr(trkorr);
    }

    public async addSrcTrkorr(trkorr: components.TRKORR): Promise<void> {
        return this._client.addSrcTrkorr(trkorr);
    }

    public async readTmsQueue(target: components.TMSSYSNAM): Promise<struct.STMSIQREQ[]> {
        return this._client.readTmsQueue(target);
    }

    public async createPackage(scompkdtln: struct.SCOMPKDTLN): Promise<void> {
        return this._client.createPackage(scompkdtln);
    }

    public async getDefaultTransportLayer(): Promise<components.DEVLAYER> {
        return this._client.getDefaultTransportLayer();
    }

    public async tadirInterface(tadir: struct.TADIR): Promise<void> {
        return this._client.tadirInterface(tadir);
    }

    public async dequeueTransport(trkorr: components.TRKORR): Promise<void> {
        return this._client.dequeueTransport(trkorr);
    }

    public async forwardTransport(trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean): Promise<void> {
        return this._client.forwardTransport(trkorr, target, source, importAgain);
    }

    public async importTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        return this._client.importTransport(trkorr, system);
    }

    public async setInstallDevc(installDevc: struct.ZTRM_INSTALLDEVC[]): Promise<void> {
        return this._client.setInstallDevc(installDevc);
    }

    public async getObjectsList(): Promise<struct.KO100[]> {
        return this._client.getObjectsList();
    }

    public async renameTransportRequest(trkorr: components.TRKORR, as4text: components.AS4TEXT): Promise<void> {
        return this._client.renameTransportRequest(trkorr, as4text);
    }

    public async setPackageIntegrity(integrity: struct.ZTRM_INTEGRITY): Promise<void> {
        return this._client.setPackageIntegrity(integrity);
    }

    public async addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void> {
        return this._client.addTranslationToTr(trkorr, devclassFilter);
    }

    public async trCopy(from: components.TRKORR, to: components.TRKORR, doc: boolean): Promise<void> {
        return this._client.trCopy(from, to, doc);
    }

    public async addNamespace(namespace: components.NAMESPACE, replicense: components.TRNLICENSE, texts: struct.TRNSPACETT[]): Promise<void> {
        return this._client.addNamespace(namespace, replicense, texts);
    }

    public async getMessage(data: SapMessage): Promise<string> {
        return this._client.getMessage(data);
    }

    public async migrateTransport(trkorr: components.TRKORR): Promise<components.ZTRM_TRKORR> {
        return this._client.migrateTransport(trkorr);
    }

    public async deleteTmsTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        return this._client.deleteTmsTransport(trkorr, system);
    }

    public async refreshTransportTmsTxt(trkorr: components.TRKORR): Promise<void> {
        return this._client.refreshTransportTmsTxt(trkorr);
    }

    public async getDotAbapgit(devclass: components.DEVCLASS): Promise<Buffer> {
        return this._client.getDotAbapgit(devclass);
    }

    public async getAbapgitSource(devclass: components.DEVCLASS): Promise<{ zip: Buffer, objects: struct.ZTY_SER_OBJ[] }> {
        return this._client.getAbapgitSource(devclass);
    }

    public async executePostActivity(data: Buffer, pre?: boolean): Promise<{ messages: struct.SYMSG[], execute?: boolean }> {
        return this._client.executePostActivity(data, pre);
    }

    public async isServerApisAllowed(): Promise<true|ClientError> {
        if(this._isServerApisAllowed === undefined){
            this._isServerApisAllowed = await this._client.isServerApisAllowed();
        }
        return this._isServerApisAllowed;
    }

    public async changeTrOwner(trkorr: components.TRKORR, owner: components.TR_AS4USER): Promise<void> {
        return this._client.changeTrOwner(trkorr, owner);
    }

}
