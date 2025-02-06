import { SapMessage } from "../client";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { ISystemConnectorBase } from "./ISystemConnectorBase";
import { RESTConnection } from "./RESTConnection";
import { RFCConnection } from "./RFCConnection";
import { SystemConnectorSupportedBulk } from "./SystemConnectorSupportedBulk";

export interface ISystemConnector extends ISystemConnectorBase {
    supportedBulk: SystemConnectorSupportedBulk,
    getConnectionData: () => RFCConnection | RESTConnection,
    getDest: () => string,
    getLogonLanguage: (c: boolean) => string,
    getLogonUser: () => string,
    connect: () => Promise<void>,
    checkConnection: () => Promise<boolean>,
    ping: () => Promise<string>,
    getFileSystem: () => Promise<struct.FILESYS>,
    getDirTrans: () => Promise<components.PFEVALUE>,
    getBinaryFile: (filePath: string) => Promise<Buffer>,
    writeBinaryFile: (filePath: string, binary: Buffer) => Promise<void>,
    createTocTransport: (text: components.AS4TEXT, target: components.TR_TARGET) => Promise<components.TRKORR>,
    createWbTransport: (text: components.AS4TEXT, target?: components.TR_TARGET) => Promise<components.TRKORR>,
    setTransportDoc: (trkorr: components.TRKORR, doc: struct.TLINE[]) => Promise<void>,
    removeComments: (trkorr: components.TRKORR, object: components.TROBJTYPE) => Promise<void>,
    addToTransportRequest: (trkorr: components.TRKORR, content: struct.E071[], lock: boolean) => Promise<void>,
    repositoryEnvironment: (objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME) => Promise<struct.SENVI[]>,
    deleteTrkorr: (trkorr: components.TRKORR) => Promise<void>,
    releaseTrkorr: (trkorr: components.TRKORR, lock: boolean, timeout?: number) => Promise<void>,
    addSkipTrkorr: (trkorr: components.TRKORR) => Promise<void>,
    addSrcTrkorr: (trkorr: components.TRKORR) => Promise<void>,
    readTmsQueue: (target: components.TMSSYSNAM) => Promise<struct.STMSIQREQ[]>,
    createPackage: (scompkdtln: struct.SCOMPKDTLN) => Promise<void>,
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
    getTransportObjectsBulk?: (trkorr: components.TRKORR) => Promise<struct.TADIR[]>,
    getExistingObjectsBulk?: (objects: struct.TADIR[]) => Promise<struct.TADIR[]>,
    addNamespace: (namespace: components.NAMESPACE, replicense: components.TRNLICENSE, texts: struct.TRNSPACETT[]) => Promise<void>,
    getMessage: (data: SapMessage) => Promise<string>
}