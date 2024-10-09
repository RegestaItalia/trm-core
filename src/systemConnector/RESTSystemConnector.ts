import { Logger } from "../logger";
import { DEVCLASS } from "../client/components";
import { TADIR } from "../client/struct";
import { Login } from "./Login";
import { ISystemConnector } from "./ISystemConnector";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { SystemConnectorBase } from "./SystemConnectorBase";
import { RESTConnection } from "./RESTConnection";
import { RESTClient } from "../client";
import normalizeUrl from "@esm2cjs/normalize-url";
import { SystemConnectorSupportedBulk } from "./SystemConnectorSupportedBulk";

const ENDPOINT_RESOURCE_BASE = '/ztrmserver';
const NONE_DEST = 'NONE';

export class RESTSystemConnector extends SystemConnectorBase implements ISystemConnector {
    private _dest: string;
    private _lang: string;
    private _user: string;
    private _client: RESTClient;

    supportedBulk: SystemConnectorSupportedBulk;

    constructor(private _connection: RESTConnection, private _login: Login) {
        super();
        this.supportedBulk = {
            getTransportObjects: true
        };
        this._login.user = this._login.user.toUpperCase();
        this._lang = this._login.lang;
        this._user = this._login.user;
        Logger.log(`REST connection data before normalize: ${JSON.stringify(this._connection)}`, true);
        this._connection.endpoint = normalizeUrl(this._connection.endpoint, {
            removeTrailingSlash: true
        });
        if(!new RegExp(`${ENDPOINT_RESOURCE_BASE}$`, 'gmi').test(this._connection.endpoint)){
            this._connection.endpoint = `${this._connection.endpoint}${ENDPOINT_RESOURCE_BASE}`;
        }
        if(!this._connection.rfcdest || this._connection.rfcdest === NONE_DEST){
            this._connection.rfcdest = NONE_DEST;
        }else{
            //bulk not supported in remote calls
            this.supportedBulk.getTransportObjects = false;
        }
        this._connection.rfcdest = this._connection.rfcdest.toUpperCase().trim();
        Logger.log(`REST connection data after normalize: ${JSON.stringify(this._connection)}`, true);
        this._client = new RESTClient(this._connection.endpoint, this._connection.rfcdest, this._login);
    }
    
    protected getSysname(): string {
        return this.getDest();
    }

    public getDest(): string {
        return this._dest;
    }

    protected getLangu(c: boolean): string {
        return this.getLogonLanguage(c);
    }

    public getLogonLanguage(c: boolean = false): string {
        if (c) {
            return Array.from(this._lang)[0];
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

    protected async listDevclassObjects(devclass: DEVCLASS): Promise<TADIR[]> {
        return this._client.getDevclassObjects(devclass);
    }

    protected async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean): Promise<void> {
        return this._client.tdevcInterface(devclass, parentcl, rmParentCl);
    }

    public getConnectionData(): RESTConnection {
        return this._connection;
    }

    public getLogonUser(): string {
        return this._user;
    }

    public async connect(): Promise<void> {
        Logger.loading(`Connecting to ${this.getDest()}...`);
        try {
            await this._client.open();
            this._dest = await this._client.getDest();
            Logger.success(`Connected to ${this.getDest()} as ${this._user}.`, false);
        } catch (e) {
            Logger.error(`Connection to ${this.getDest()} as ${this._user} failed.`, false);
            throw e;
        }
    }

    public async checkConnection(): Promise<boolean> {
        return this._client.checkConnection();
    }

    public async ping(): Promise<string> {
        return await this._client.trmServerPing();
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

    public async getTransportObjectsBulk(trkorr: components.TRKORR): Promise<TADIR[]> {
        return this._client.getTransportObjectsBulk(trkorr);
    }

}