import { valid as semverValid } from "semver";
import { Logger } from "../logger";
import { Manifest } from "../manifest";
import { Registry, RegistryType } from "../registry";
import { IClient, RFCClient } from "../client";
import { DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../client/components";
import { T100, TADIR, TDEVC, TMSCSYS } from "../client/struct";
import { COMMENT_OBJ, Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { Connection } from "./Connection";
import { Login } from "./Login";
import { InstallPackage } from "./InstallPackage";
import { SapMessage } from "./SapMessage";
import * as components from "../client/components";
import * as struct from "../client/struct";

export interface ISystemConnector {
    getDest: () => string,
    getLogonLanguage: (c: boolean) => string,
    getLogonUser: () => string,
    connect: () => Promise<void>,
    checkConnection: () => Promise<boolean>,
    getTransportStatus: (trkorr: TRKORR) => Promise<string>,
    getPackageWorkbenchTransport: (oPackage: TrmPackage) => Promise<Transport>,
    getInstalledPackages: (includeSoruces: boolean) => Promise<TrmPackage[]>,
    generateTrmServerPackage: () => Promise<TrmPackage>,
    getDevclass: (devclass: DEVCLASS) => Promise<TDEVC>,
    getTransportTargets: () => Promise<TMSCSYS[]>,
    getSubpackages: (devclass: DEVCLASS) => Promise<TDEVC[]>,
    getObject: (pgmid: PGMID, object: TROBJTYPE, objName: SOBJ_NAME) => Promise<TADIR>,
    getIgnoredTrkorr: () => Promise<TRKORR[]>,
    getSourceTrkorr: () => Promise<TRKORR[]>,
    getInstallPackages: (packageName: string, registry: Registry) => Promise<InstallPackage[]>,
    setPackageSuperpackage: (devclass: DEVCLASS, superpackage: DEVCLASS) => Promise<void>,
    clearPackageSuperpackage: (devclass: DEVCLASS) => Promise<void>,
    getMessage: (data: SapMessage) => Promise<string>,
    checkSapEntryExists: (table: string, sapEntry: any) => Promise<boolean>,
    ping: () => Promise<string>,
    getPackageIntegrity: (oPackage: TrmPackage) => Promise<string>,
    readTable: (tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string) => Promise<any[]>,
    getFileSystem: () => Promise<struct.FILESYS>,
    getDirTrans: () => Promise<components.PFEVALUE>,
    getBinaryFile: (filePath: string) => Promise<Buffer>,
    writeBinaryFile: (filePath: string, binary: Buffer) => Promise<void>,
    createTocTransport: (text: components.AS4TEXT, target: components.TR_TARGET) => Promise<components.TRKORR>,
    createWbTransport: (text: components.AS4TEXT, target?: components.TR_TARGET) => Promise<components.TRKORR>,
    setTransportDoc: (trkorr: components.TRKORR, doc: struct.TLINE[]) => Promise<void>,
    getDevclassObjects: (devclass: components.DEVCLASS, includeSubpackages: boolean) => Promise<struct.TADIR[]>,
    addToTransportRequest: (trkorr: components.TRKORR, content: struct.E071[], lock: boolean) => Promise<void>,
    repositoryEnvironment: (objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME) => Promise<struct.SENVI[]>,
    deleteTrkorr: (trkorr: components.TRKORR) => Promise<void>,
    releaseTrkorr: (trkorr: components.TRKORR, lock: boolean, timeout?: number) => Promise<void>,
    addSkipTrkorr: (trkorr: components.TRKORR) => Promise<void>,
    addSrcTrkorr: (trkorr: components.TRKORR) => Promise<void>,
    readTmsQueue: (target: components.TMSSYSNAM) => Promise<struct.STMSIQREQ[]>,
    createPackage: (scompkdtln: struct.SCOMPKDTLN) => Promise<void>,
    tdevcInterface: (devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean) => Promise<void>,
    getDefaultTransportLayer: () => Promise<components.DEVLAYER>,
    tadirInterface: (tadir: struct.TADIR) => Promise<void>,
    dequeueTransport: (trkorr: components.TRKORR) => Promise<void>,
    forwardTransport: (trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean) => Promise<void>,
    importTransport: (trkorr: components.TRKORR, system: components.TMSSYSNAM) => Promise<void>,
    setInstallDevc: (installDevc: struct.ZTRM_INSTALLDEVC[]) => Promise<void>,
    getObjectsList: () => Promise<struct.KO100[]>,
    renameTransportRequest: (trkorr: components.TRKORR, as4text: components.AS4TEXT) => Promise<void>,
    setPackageIntegrity: (integrity: struct.ZTRM_INTEGRITY) => Promise<void>,
    addTranslationToTr: (trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]) => Promise<void>,
    trCopy: (from: components.TRKORR, to: components.TRKORR, doc: boolean) => Promise<void>,
    getFunctionModule: (func: components.RS38L_FNAME) => Promise<struct.TFDIR>
}