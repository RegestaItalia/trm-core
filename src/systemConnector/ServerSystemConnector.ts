import { valid as semverValid } from "semver";
import { Logger, inspect } from "../logger";
import { Manifest } from "../manifest";
import { PUBLIC_RESERVED_KEYWORD, Registry, RegistryType } from "../registry";
import { RFCClient } from "../client";
import { DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../client/components";
import { T100, TADIR, TDEVC, TMSCSYS } from "../client/struct";
import { COMMENT_OBJ, Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { Connection } from "./Connection";
import { Login } from "./Login";
import { ISystemConnector } from "./ISystemConnector";
import { SapMessage } from "./SapMessage";
import { InstallPackage } from "./InstallPackage";
import * as components from "../client/components";
import * as struct from "../client/struct";

export const TRM_SERVER_PACKAGE_NAME: string = 'trm-server';
export const SRC_TRKORR_TABL = 'ZTRM_SRC_TRKORR';
export const SKIP_TRKORR_TABL = 'ZTRM_SKIP_TRKORR';

export class ServerSystemConnector implements ISystemConnector {
    private _lang: string;
    private _user: string;
    private _client: RFCClient;

    private _installedPackages: TrmPackage[];
    private _installedPackagesI: TrmPackage[];

    constructor(private _connection: Connection, private _login: Login) {
        this._login.user = this._login.user.toUpperCase();
        this._lang = this._login.lang;
        this._user = this._login.user;
        if (!this._connection.saprouter) {
            delete this._connection.saprouter;
        }
        this._client = new RFCClient({ ...this._connection, ...this._login });
    }

    public getConnectionData(): Connection {
        return this._connection;
    }

    public getDest(): string {
        return this._connection.dest;
    }

    public getLogonLanguage(c: boolean = false): string {
        if (c) {
            return Array.from(this._lang)[0];
        } else {
            return this._lang;
        }
    }

    public getLogonUser(): string {
        return this._user;
    }

    public async connect(): Promise<void> {
        Logger.loading(`Connecting to ${this.getDest()}...`);
        try {
            await this._client.open();
            Logger.success(`Connected to ${this.getDest()} as ${this._user}.`, false);
        } catch (e) {
            Logger.error(`Connection to ${this.getDest()} as ${this._user} failed.`, false);
            throw e;
        }
    }

    public async checkConnection(): Promise<boolean> {
        return this._client.checkConnection();
    }

    public async getTransportStatus(trkorr: TRKORR): Promise<string> {
        const aTrkorrStatusCheck: any[] = (await this.readTable('E070',
            [{ fieldName: 'TRKORR' }, { fieldName: 'TRSTATUS' }],
            `TRKORR EQ '${trkorr}'`
        ));
        if (aTrkorrStatusCheck.length !== 1) {
            throw new Error(`Transport not found.`);
        } else {
            return aTrkorrStatusCheck[0].trstatus;
        }
    }

    public async getPackageWorkbenchTransport(oPackage: TrmPackage): Promise<Transport> {
        var aTrkorr: TRKORR[] = (await this.readTable('E071',
            [{ fieldName: 'TRKORR' }],
            `PGMID EQ '*' AND OBJECT EQ '${COMMENT_OBJ}'`
        )).map(o => o.trkorr);
        //because we're extracting from e071, there will be multiple records with the same trkorr
        //unique array
        aTrkorr = Array.from(new Set(aTrkorr))

        //for each transport, check its status is D (can be released)
        var aSkipTrkorr: string[] = [];
        for (const sTrkorr of aTrkorr) {
            var canBeReleased = false;
            try {
                canBeReleased = (await this.getTransportStatus(sTrkorr)) === 'D';
            } catch (e) {
                canBeReleased = false;
            }
            if (!canBeReleased) {
                aSkipTrkorr.push(sTrkorr);
            }
        }

        //filter transports
        aTrkorr = aTrkorr.filter(trkorr => !aSkipTrkorr.includes(trkorr));

        const transports: Transport[] = aTrkorr.map(trkorr => new Transport(trkorr));
        var packageTransports: Transport[] = [];
        for (const transport of transports) {
            const transportPackage = await transport.getLinkedPackage();
            if (transportPackage) {
                if (TrmPackage.compare(transportPackage, oPackage)) {
                    packageTransports.push(transport);
                }
            }
        }

        if (packageTransports.length > 0) {
            return await Transport.getLatest(packageTransports);
        }

        return null;
    }

    public async getInstalledPackages(includeSoruces: boolean = true, refresh?: boolean): Promise<TrmPackage[]> {
        if(!refresh){
            if(includeSoruces && this._installedPackagesI){
                Logger.log(`Cached version of installed packages with sources`, true);
                return this._installedPackagesI;
            }else if(!includeSoruces && this._installedPackages){
                Logger.log(`Cached version of installed packages without sources`, true);
                return this._installedPackages;
            }
        }
        var trmPackages: TrmPackage[] = [];
        var packageTransports: {
            package: TrmPackage,
            transports: Transport[]
        }[] = [];
        Logger.log(`Ready to read installed packages`, true);
        Logger.log(`Include sources: ${includeSoruces}`, true);
        const aSourceTrkorr = includeSoruces ? (await this.getSourceTrkorr()) : [];
        Logger.log(`Source trkorr ${JSON.stringify(aSourceTrkorr)}`, true);
        var aSkipTrkorr = await this.getIgnoredTrkorr();
        Logger.log(`Ignored trkorr ${JSON.stringify(aSkipTrkorr)}`, true);
        var aTrkorr: TRKORR[] = (await this.readTable('E071',
            [{ fieldName: 'TRKORR' }],
            `PGMID EQ '*' AND OBJECT EQ '${COMMENT_OBJ}'`
        )).map(o => o.trkorr);
        //because we're extracting from e071, there will be multiple records with the same trkorr
        //unique array
        aTrkorr = Array.from(new Set(aTrkorr))

        //for each transport, check it was installed and not created on the system
        //read tms of current system and with maxrc > 0 and impsing != X
        //if there's no match, ignore
        for (const sTrkorr of aTrkorr) {
            //check tms
            //don't check transports from source
            if (!aSourceTrkorr.includes(sTrkorr)) {
                Logger.log(`${sTrkorr} not from source`, true);
                var aTrkorrStatusCheck: any[];
                try {
                    Logger.log(`Checking ${sTrkorr} TMS import result`, true);
                    aTrkorrStatusCheck = (await this.readTable('TMSBUFFER',
                        [{ fieldName: 'TRKORR' }, { fieldName: 'MAXRC' }],
                        //is the condition (IMPFLG EQ 't' OR IMPFLG EQ 'k') necessary?
                        `SYSNAM EQ '${this.getDest()}' AND TRKORR EQ '${sTrkorr}' AND IMPSING NE 'X'`
                    )).filter(o => parseInt(o.maxrc) > 0);
                } catch (e) {
                    aTrkorrStatusCheck = [];
                }
                //might be imported multiple times, so do not check if lenght is 1
                if (aTrkorrStatusCheck.length === 0) {
                    Logger.log(`Adding ${sTrkorr} to skipped filter`, true);
                    aSkipTrkorr.push(sTrkorr);
                }
            }
        }

        //filter transports (manually ignored transports and not imported transports)
        aTrkorr = aTrkorr.filter(trkorr => !aSkipTrkorr.includes(trkorr));
        Logger.log(`Final transports ${JSON.stringify(aTrkorr)}`, true);

        const transports: Transport[] = aTrkorr.map(trkorr => new Transport(trkorr));
        for (const transport of transports) {
            const trmPackage = await transport.getLinkedPackage();
            if (trmPackage) {
                Logger.log(`Transport ${transport.trkorr}, found linked package`, true);
                //only compares package name and registry
                var arrayIndex = packageTransports.findIndex(o => TrmPackage.compare(o.package, trmPackage));
                if (arrayIndex < 0) {
                    arrayIndex = packageTransports.push({
                        package: trmPackage,
                        transports: []
                    });
                    arrayIndex--;
                }
                packageTransports[arrayIndex].transports.push(transport);
            }
        }
        Logger.log(`Package Transports map: ${inspect(packageTransports, { breakLength: Infinity, compact: true })}`, true);
        for (const packageTransport of packageTransports) {
            const latestTransport = await Transport.getLatest(packageTransport.transports);
            if (latestTransport) {
                trmPackages.push(await latestTransport.getLinkedPackage());
            }
        }
        Logger.log(`Packages found: ${inspect(trmPackages, { breakLength: Infinity, compact: true })}`, true);
        Logger.log(`Excluding trm-server (adding it manually)`, true);
        //exclude trm-server and add manually
        //this is to ensure the version is correct
        //say it was installed via trm, then pulled from abapgit, the version would refer to the old trm version
        try {
            const trmServerPackage = trmPackages.find(o => o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(new Registry(PUBLIC_RESERVED_KEYWORD)));
            var generatedTrmServerPackage = await this.generateTrmServerPackage();
            if (trmServerPackage && trmServerPackage.manifest) {
                Logger.log(`trm-server was found (it was imported via transport)`, true);
                if (trmServerPackage.manifest.get().version === generatedTrmServerPackage.manifest.get().version) {
                    Logger.log(`trm-server imported is the one currenlty in use`, true);
                    //generatedTrmServerPackage.manifest.setLinkedTransport(trmServerPackage.manifest.getLinkedTransport());
                    generatedTrmServerPackage.manifest = trmServerPackage.manifest;
                }
            }
            trmPackages = trmPackages.filter(o => !(o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(new Registry(PUBLIC_RESERVED_KEYWORD))));
            trmPackages.push(generatedTrmServerPackage);
        } catch (e) {
            //trm-server is not installed
            Logger.warning(`trm-server is not installed`, true);
        }
        if(includeSoruces){
            this._installedPackagesI = trmPackages;
        }else{
            this._installedPackages = trmPackages;
        }
        return trmPackages;
    }

    public async generateTrmServerPackage(): Promise<TrmPackage> {
        var oPackage: TrmPackage;
        const oPublicRegistry = new Registry(PUBLIC_RESERVED_KEYWORD);
        const fugr = await this.getObject('R3TR', 'FUGR', 'ZTRM');
        if (fugr) {
            try {
                const trmServerVersion = await this._client.getTrmServerVersion();
                const oManifest = new Manifest({
                    name: TRM_SERVER_PACKAGE_NAME,
                    version: trmServerVersion
                });
                if (semverValid(trmServerVersion)) {
                    oPackage = new TrmPackage(TRM_SERVER_PACKAGE_NAME, oPublicRegistry, oManifest).setDevclass(fugr.devclass);
                }
            } catch (e) { }
        }
        if (!oPackage) {
            throw new Error(`Package ${TRM_SERVER_PACKAGE_NAME} was not found.`);
        }
        return oPackage;
    }

    public async getDevclass(devclass: DEVCLASS): Promise<TDEVC> {
        const tdevc: TDEVC[] = await this.readTable('TDEVC',
            [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }],
            `DEVCLASS EQ '${devclass.trim().toUpperCase()}'`
        );
        if (tdevc.length === 1) {
            return tdevc[0];
        }
    }

    public async getTransportTargets(): Promise<TMSCSYS[]> {
        //systyp might not be available in some releases?
        try {
            return await this.readTable('TMSCSYS',
                [{ fieldName: 'SYSNAM' }, { fieldName: 'SYSTXT' }, { fieldName: 'SYSTYP' }]
            );
        } catch (e) {
            return await this.readTable('TMSCSYS',
                [{ fieldName: 'SYSNAM' }, { fieldName: 'SYSTXT' }]
            );
        }
    }

    public async getSubpackages(devclass: DEVCLASS): Promise<TDEVC[]> {
        const queryFields = [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }];
        var subpackages: {
            tdevc: TDEVC,
            queryDone: boolean
        }[] = [];
        const initial: TDEVC[] = await this.readTable('TDEVC',
            queryFields,
            `DEVCLASS EQ '${devclass.trim().toUpperCase()}'`
        );
        if (initial.length === 1) {
            subpackages.push({
                tdevc: initial[0],
                queryDone: false
            });
        }
        while (subpackages.find(o => !o.queryDone)) {
            const searchParentIndex = subpackages.findIndex(o => !o.queryDone);
            const tdevc: TDEVC[] = await this.readTable('TDEVC',
                queryFields,
                `PARENTCL EQ '${subpackages[searchParentIndex].tdevc.devclass.trim().toUpperCase()}'`
            );
            subpackages[searchParentIndex].queryDone = true;
            tdevc.forEach(o => {
                subpackages.push({
                    tdevc: o,
                    queryDone: false
                });
            });
        }
        return subpackages.map(o => o.tdevc).filter(o => o.devclass !== devclass.trim().toUpperCase());
    }

    public async getDevclassObjects(devclass: DEVCLASS, includeSubpackages: boolean = true): Promise<TADIR[]> {
        var aTadir: TADIR[] = [];
        var aDevclass: DEVCLASS[] = [devclass];
        if (includeSubpackages) {
            aDevclass = aDevclass.concat(((await this.getSubpackages(devclass)).map(o => o.devclass)));
        }
        for (const d of aDevclass) {
            aTadir = aTadir.concat(((await this._client.getDevclassObjects(d.trim().toUpperCase()))));
        }
        return aTadir;
    }

    public async getObject(pgmid: PGMID, object: TROBJTYPE, objName: SOBJ_NAME): Promise<TADIR> {
        const tadir: TADIR[] = await this.readTable('TADIR',
            [{ fieldName: 'PGMID' }, { fieldName: 'OBJECT' }, { fieldName: 'OBJ_NAME' }, { fieldName: 'DEVCLASS' }, { fieldName: 'SRCSYSTEM' }, { fieldName: 'AUTHOR' }],
            `PGMID EQ '${pgmid.trim().toUpperCase()}' AND OBJECT EQ '${object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objName.trim().toUpperCase()}'`
        );
        if (tadir.length === 1) {
            return tadir[0];
        }
    }

    public async getIgnoredTrkorr(): Promise<TRKORR[]> {
        Logger.log(`Reading ignored transports`, true);
        Logger.log(`Checking if ${SKIP_TRKORR_TABL} exists`, true);
        const tablExists: any[] = await this.readTable('TADIR',
            [{ fieldName: 'OBJ_NAME' }],
            `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SKIP_TRKORR_TABL}'`);
        if (tablExists.length === 1) {
            Logger.log(`TABLE ${SKIP_TRKORR_TABL} exists`, true);
            const skipTrkorr: {
                trkorr: TRKORR
            }[] = await this.readTable(SKIP_TRKORR_TABL,
                [{ fieldName: 'TRKORR' }]
            );
            return skipTrkorr.map(o => o.trkorr);
        } else {
            return [];
        }
    }

    public async getSourceTrkorr(): Promise<TRKORR[]> {
        Logger.log(`Ready to read installed packages`, true);
        Logger.log(`Checking if ${SRC_TRKORR_TABL} exists`, true);
        const tablExists: any[] = await this.readTable('TADIR',
            [{ fieldName: 'OBJ_NAME' }],
            `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SRC_TRKORR_TABL}'`);
        if (tablExists.length === 1) {
            Logger.log(`TABL ${SRC_TRKORR_TABL} exists`, true);
            const srcTrkorr: {
                trkorr: TRKORR
            }[] = await this.readTable(SRC_TRKORR_TABL,
                [{ fieldName: 'TRKORR' }]
            );
            return srcTrkorr.map(o => o.trkorr);
        } else {
            return [];
        }
    }

    public async getInstallPackages(packageName: string, registry: Registry): Promise<InstallPackage[]> {
        const registryEndpoint = registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : registry.endpoint;
        return await this.readTable('ZTRMVINSTALLDEVC',
            [{ fieldName: 'ORIGINAL_DEVCLASS' }, { fieldName: 'INSTALL_DEVCLASS' }],
            `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
        );
    }

    public async setPackageSuperpackage(devclass: DEVCLASS, superpackage: DEVCLASS): Promise<void> {
        return await this.tdevcInterface(devclass, superpackage);
    }

    public async clearPackageSuperpackage(devclass: DEVCLASS): Promise<void> {
        return await this.tdevcInterface(devclass, null, true);
    }

    public async getMessage(data: SapMessage): Promise<string> {
        var msgnr = data.no;
        while (msgnr.length < 3) {
            msgnr = `0${msgnr}`;
        }
        const aT100: T100[] = await this.readTable('T100',
            [{ fieldName: 'SPRSL' }, { fieldName: 'ARBGB' }, { fieldName: 'MSGNR' }, { fieldName: 'TEXT' }],
            `SPRSL EQ '${this.getLogonLanguage(true)}' AND ARBGB EQ '${data.class}' AND MSGNR EQ '${msgnr}'`
        );
        if (aT100.length === 1) {
            var msg = aT100[0].text;
            msg = msg.replace(/&(1)?/, data.v1 || '');
            msg = msg.replace(/&(2)?/, data.v2 || '');
            msg = msg.replace(/&(3)?/, data.v3 || '');
            msg = msg.replace(/&(4)?/, data.v4 || '');
            return msg;
        } else {
            throw new Error(`Message ${msgnr}, class ${data.class}, lang ${this.getLogonLanguage(true)} not found.`);
        }
    }

    public async checkSapEntryExists(table: string, sapEntry: any): Promise<boolean> {
        try {
            var aQuery = [];
            Object.keys(sapEntry).forEach(k => {
                aQuery.push(`${k.trim().toUpperCase()} EQ '${sapEntry[k]}'`);
            });
            const entry: any[] = await this.readTable(table.trim().toUpperCase(),
                [{ fieldName: Object.keys(sapEntry)[0].trim().toUpperCase() }],
                aQuery.join(' AND '));
            return entry.length > 0;
        } catch (e) {
            return false;
        }
    }

    public async ping(): Promise<string> {
        return await this._client.trmServerPing();
    }

    public async getPackageIntegrity(oPackage: TrmPackage): Promise<string> {
        const packageName = oPackage.packageName;
        const registryEndpoint = oPackage.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : oPackage.registry.endpoint;
        const aIntegrity: { integrity: string }[] = await this.readTable('ZTRM_INTEGRITY',
            [{ fieldName: 'INTEGRITY' }],
            `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
        );
        if (aIntegrity.length === 1) {
            return aIntegrity[0].integrity;
        } else {
            return ''; //avoid returning undefined
        }
    }

    public async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        return this._client.readTable(tableName, fields, options);
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

    public async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean): Promise<void> {
        return this._client.tdevcInterface(devclass, parentcl, rmParentCl);
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

    public async getFunctionModule(func: string): Promise<struct.TFDIR> {
        const aTfdir: struct.TFDIR[] = await this.readTable('TFDIR',
            [{ fieldName: 'FUNCNAME' }, { fieldName: 'PNAME' }],
            `FUNCNAME EQ '${func.trim().toUpperCase()}'`
        );
        if (aTfdir.length === 1) {
            return aTfdir[0];
        }
    }
}