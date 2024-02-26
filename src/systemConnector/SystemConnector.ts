import { valid as semverValid } from "semver";
import { Logger } from "../logger";
import { Manifest } from "../manifest";
import { Registry, RegistryType } from "../registry";
import { RFCClient } from "../rfc/client";
import { DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../rfc/components";
import { T100, TADIR, TDEVC, TMSCSYS } from "../rfc/struct";
import { COMMENT_OBJ, Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { Connection } from "./Connection";
import { Login } from "./Login";

export const TRM_SERVER_PACKAGE_NAME: string = 'trm-server';
export const SRC_TRKORR_TABL = 'ZTRM_SRC_TRKORR';
export const SKIP_TRKORR_TABL = 'ZTRM_SKIP_TRKORR';

export class SystemConnector {
    private _dest: string;
    private _lang: string;
    private _user: string;
    address: string;
    rfcClient: RFCClient;

    constructor(private _connection: Connection, private _login: Login) {
        this._dest = this._connection.dest;
        this._lang = this._login.lang;
        this._user = this._login.user;
        this.address = this._connection.ashost;
        if (!this._connection.saprouter) {
            delete this._connection.saprouter;
        }
        this.rfcClient = new RFCClient({ ...this._connection, ...this._login });
    }

    public getDest(): string {
        return this._dest;
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

    public async connect(skipLog: boolean = false) {
        Logger.loading(`Connecting to ${this._dest}...`);
        try {
            await this.rfcClient.open();
            Logger.success(`Connected to ${this._dest} as ${this._user}.`, skipLog);
        } catch (e) {
            Logger.error(`Connection to ${this._dest} as ${this._user} failed.`, skipLog);
            throw e;
        }
    }

    public async getTransportStatus(trkorr: TRKORR): Promise<string> {
        const aTrkorrStatusCheck: any[] = (await this.rfcClient.readTable('E070',
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
        var aTrkorr: TRKORR[] = (await this.rfcClient.readTable('E071',
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

        const transports: Transport[] = aTrkorr.map(trkorr => new Transport(trkorr, this));
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

    public async getInstalledPackages(skipLog: boolean = false, includeSoruces: boolean = true): Promise<TrmPackage[]> {
        var trmPackages: TrmPackage[] = [];
        var packageTransports: {
            package: TrmPackage,
            transports: Transport[]
        }[] = [];
        const aSourceTrkorr = includeSoruces ? (await this.getSourceTrkorr()) : [];
        var aSkipTrkorr = await this.getIgnoredTrkorr();
        var aTrkorr: TRKORR[] = (await this.rfcClient.readTable('E071',
            [{ fieldName: 'TRKORR' }],
            `PGMID EQ '*' AND OBJECT EQ '${COMMENT_OBJ}'`
        )).map(o => o.trkorr);
        //because we're extracting from e071, there will be multiple records with the same trkorr
        //unique array
        aTrkorr = Array.from(new Set(aTrkorr))

        //for each transport, check it was installed and not created on the system
        //read tms of current system and with maxrc <= 4 and impsing != X
        //if there's no match, ignore
        for (const sTrkorr of aTrkorr) {
            //check tms
            //don't check transports from source
            if (!aSourceTrkorr.includes(sTrkorr)) {
                var aTrkorrStatusCheck: any[];
                try {
                    aTrkorrStatusCheck = (await this.rfcClient.readTable('TMSBUFFER',
                        [{ fieldName: 'TRKORR' }, { fieldName: 'MAXRC' }],
                        //is the condition (IMPFLG EQ 't' OR IMPFLG EQ 'k') necessary?
                        `SYSNAM EQ '${this._dest}' AND TRKORR EQ '${sTrkorr}' AND IMPSING NE 'X'`
                    )).filter(o => parseInt(o.maxrc) <= 4);
                } catch (e) {
                    aTrkorrStatusCheck = [];
                }
                //might be imported multiple times, so do not check if lenght is 1
                if (aTrkorrStatusCheck.length === 0) {
                    aSkipTrkorr.push(sTrkorr);
                }
            }
        }

        //filter transports (manually ignored transports and not imported transports)
        aTrkorr = aTrkorr.filter(trkorr => !aSkipTrkorr.includes(trkorr));

        const transports: Transport[] = aTrkorr.map(trkorr => new Transport(trkorr, this));
        for (const transport of transports) {
            const trmPackage = await transport.getLinkedPackage();
            if (trmPackage) {
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
        for (const packageTransport of packageTransports) {
            const latestTransport = await Transport.getLatest(packageTransport.transports);
            if (latestTransport) {
                trmPackages.push(await latestTransport.getLinkedPackage());
            }
        }
        //exclude trm-server and add manually
        //this is to ensure the version is correct
        //say it was installed via trm, then pulled from abapgit, the version would refer to the old trm version
        try {
            const trmServerPackage = trmPackages.find(o => o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(new Registry('public')));
            var generatedTrmServerPackage = await this.generateTrmServerPackage();
            if(trmServerPackage && trmServerPackage.manifest){
                if(trmServerPackage.manifest.get().version === generatedTrmServerPackage.manifest.get().version){
                    generatedTrmServerPackage.manifest.setLinkedTransport(trmServerPackage.manifest.getLinkedTransport());
                }
            }
            trmPackages = trmPackages.filter(o => !(o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(new Registry('public'))));
            trmPackages.push(generatedTrmServerPackage);
        } catch (e) {
            //trm-server is not installed
        }
        return trmPackages;
    }

    public async generateTrmServerPackage(): Promise<TrmPackage> {
        var oPackage: TrmPackage;
        const oPublicRegistry = new Registry('public');
        const fugr = await this.getObject('R3TR', 'FUGR', 'ZTRM');
        if(fugr){
            try {
                const trmServerVersion = await this.rfcClient.getTrmServerVersion();
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
        const tdevc: TDEVC[] = await this.rfcClient.readTable('TDEVC',
            [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }],
            `DEVCLASS EQ '${devclass.trim().toUpperCase()}'`
        );
        if (tdevc.length === 1) {
            return tdevc[0];
        }
    }

    public async getTransportTargets(): Promise<TMSCSYS[]> {
        return await this.rfcClient.readTable('TMSCSYS',
            [{ fieldName: 'SYSNAM' }, { fieldName: 'SYSTXT' }]
        );
    }

    public async getSubpackages(devclass: DEVCLASS): Promise<TDEVC[]> {
        const queryFields = [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }];
        var subpackages: {
            tdevc: TDEVC,
            queryDone: boolean
        }[] = [];
        const initial: TDEVC[] = await this.rfcClient.readTable('TDEVC',
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
            const tdevc: TDEVC[] = await this.rfcClient.readTable('TDEVC',
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
            aTadir = aTadir.concat(((await this.rfcClient.getDevclassObjects(d.trim().toUpperCase()))));
        }
        return aTadir;
    }

    public async getObject(pgmid: PGMID, object: TROBJTYPE, objName: SOBJ_NAME): Promise<TADIR> {
        const tadir: TADIR[] = await this.rfcClient.readTable('TADIR',
            [{ fieldName: 'PGMID' }, { fieldName: 'OBJECT' }, { fieldName: 'OBJ_NAME' }, { fieldName: 'DEVCLASS' }, { fieldName: 'SRCSYSTEM' }, { fieldName: 'AUTHOR' }],
            `PGMID EQ '${pgmid.trim().toUpperCase()}' AND OBJECT EQ '${object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objName.trim().toUpperCase()}'`
        );
        if (tadir.length === 1) {
            return tadir[0];
        }
    }

    public async getIgnoredTrkorr(): Promise<TRKORR[]> {
        const tablExists: any[] = await this.rfcClient.readTable('TADIR',
            [{ fieldName: 'OBJ_NAME' }],
            `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SKIP_TRKORR_TABL}'`);
        if (tablExists.length === 1) {
            const skipTrkorr: {
                trkorr: TRKORR
            }[] = await this.rfcClient.readTable(SKIP_TRKORR_TABL,
                [{ fieldName: 'TRKORR' }]
            );
            return skipTrkorr.map(o => o.trkorr);
        } else {
            return [];
        }
    }

    public async getSourceTrkorr(): Promise<TRKORR[]> {
        const tablExists: any[] = await this.rfcClient.readTable('TADIR',
            [{ fieldName: 'OBJ_NAME' }],
            `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SRC_TRKORR_TABL}'`);
        if (tablExists.length === 1) {
            const srcTrkorr: {
                trkorr: TRKORR
            }[] = await this.rfcClient.readTable(SRC_TRKORR_TABL,
                [{ fieldName: 'TRKORR' }]
            );
            return srcTrkorr.map(o => o.trkorr);
        } else {
            return [];
        }
    }

    public async addToIgnoredTrkorr(trkorr: TRKORR): Promise<void> {
        await this.rfcClient.addSkipTrkorr(trkorr);
    }

    public async addToSrcTrkorr(trkorr: TRKORR): Promise<void> {
        await this.rfcClient.addSrcTrkorr(trkorr);
    }

    public async getInstallPackages(packageName: string, registry: Registry): Promise<{
        originalDevclass: DEVCLASS,
        installDevclass: DEVCLASS
    }[]> {
        const registryEndpoint = registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : registry.endpoint;
        return await this.rfcClient.readTable('ZTRMVINSTALLDEVC',
            [{ fieldName: 'ORIGINAL_DEVCLASS' }, { fieldName: 'INSTALL_DEVCLASS' }],
            `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
        );
    }

    public async setPackageSuperpackage(devclass: DEVCLASS, superpackage: DEVCLASS): Promise<void> {
        return await this.rfcClient.tdevcInterface(devclass, superpackage);
    }

    public async clearPackageSuperpackage(devclass: DEVCLASS): Promise<void> {
        return await this.rfcClient.tdevcInterface(devclass, null, true);
    }

    public async getMessage(data: {
        class: string,
        no: string,
        v1?: string,
        v2?: string,
        v3?: string,
        v4?: string
    }): Promise<string> {
        var msgnr = data.no;
        while (msgnr.length < 3) {
            msgnr = `0${msgnr}`;
        }
        const aT100: T100[] = await this.rfcClient.readTable('T100',
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
            const entry: any[] = await this.rfcClient.readTable(table.trim().toUpperCase(),
                [{ fieldName: Object.keys(sapEntry)[0].trim().toUpperCase() }],
                aQuery.join(' AND '));
            return entry.length > 0;
        } catch (e) {
            return false;
        }
    }

    public async ping(): Promise<string> {
        return await this.rfcClient.trmServerPing();
    }

    public async getPackageIntegrity(oPackage: TrmPackage): Promise<string> {
        const packageName = oPackage.packageName;
        const registryEndpoint = oPackage.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : oPackage.registry.endpoint;
        const aIntegrity: { integrity: string }[] = await this.rfcClient.readTable('ZTRM_INTEGRITY',
            [{ fieldName: 'INTEGRITY' }],
            `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
        );
        if (aIntegrity.length === 1) {
            return aIntegrity[0].integrity;
        } else {
            return ''; //avoid returning undefined
        }
    }
}