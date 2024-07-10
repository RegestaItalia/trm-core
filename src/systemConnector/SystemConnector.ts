import { TRKORR, DEVCLASS, TDEVC, TMSCSYS, TADIR, PGMID, TROBJTYPE, SOBJ_NAME } from "../client";
import { Registry } from "../registry";
import { Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { ISystemConnector } from "./ISystemConnector";
import { InstallPackage } from "./InstallPackage";
import { SapMessage } from "./SapMessage";
import * as components from "../client/components";
import * as struct from "../client/struct";

export namespace SystemConnector {
    export var systemConnector: ISystemConnector;
    
    function checkSystemConnector(){
        if(!systemConnector){
            throw new Error('System connector not initialized.');
        }else{
            return new Promise<void>((res, rej) => {
                systemConnector.checkConnection().then(() => {
                    res();
                }).catch(e => {
                    rej(e);
                })
            });
        }
    }

    export function getConnectionData(): any {
        checkSystemConnector();
        return systemConnector.getConnectionData();
    }

    export function getDest(): string {
        checkSystemConnector();
        return systemConnector.getDest();
    }
    
    export function getLogonLanguage(c: boolean): string {
        checkSystemConnector();
        return systemConnector.getLogonLanguage(c);
    }
    
    export function getLogonUser(): string {
        checkSystemConnector();
        return systemConnector.getLogonUser();
    }
    
    export async function connect(): Promise<void> {
        await checkSystemConnector();
        return systemConnector.connect();
    }
    
    export async function checkConnection(): Promise<boolean> {
        await checkSystemConnector();
        return systemConnector.checkConnection();
    }
    
    export async function getTransportStatus(trkorr: TRKORR): Promise<string> {
        await checkSystemConnector();
        return systemConnector.getTransportStatus(trkorr);
    }
    
    export async function getPackageWorkbenchTransport(oPackage: TrmPackage): Promise<Transport> {
        await checkSystemConnector();
        return systemConnector.getPackageWorkbenchTransport(oPackage);
    }
    
    export async function getInstalledPackages(includeSources: boolean, refresh?: boolean): Promise<TrmPackage[]> {
        await checkSystemConnector();
        return systemConnector.getInstalledPackages(includeSources, refresh);
    }
    
    export async function generateTrmServerPackage(): Promise<TrmPackage> {
        await checkSystemConnector();
        return systemConnector.generateTrmServerPackage();
    }
    
    export async function getDevclass(devclass: DEVCLASS): Promise<TDEVC> {
        await checkSystemConnector();
        return systemConnector.getDevclass(devclass);
    }
    
    export async function getTransportTargets(): Promise<TMSCSYS[]> {
        await checkSystemConnector();
        return systemConnector.getTransportTargets();
    }
    
    export async function getSubpackages(devclass: DEVCLASS): Promise<TDEVC[]> {
        await checkSystemConnector();
        return systemConnector.getSubpackages(devclass);
    }
    
    export async function getDevclassObjects(devclass: DEVCLASS, includeSubpackages: boolean): Promise<TADIR[]> {
        await checkSystemConnector();
        return systemConnector.getDevclassObjects(devclass, includeSubpackages);
    }
    
    export async function getObject(pgmid: PGMID, object: TROBJTYPE, objName: SOBJ_NAME): Promise<TADIR> {
        await checkSystemConnector();
        return systemConnector.getObject(pgmid, object, objName);
    }
    
    export async function getIgnoredTrkorr(): Promise<TRKORR[]> {
        await checkSystemConnector();
        return systemConnector.getIgnoredTrkorr();
    }
    
    export async function getSourceTrkorr(): Promise<TRKORR[]> {
        await checkSystemConnector();
        return systemConnector.getSourceTrkorr();
    }
    
    export async function addSrcTrkorr(trkorr: TRKORR): Promise<void> {
        await checkSystemConnector();
        return systemConnector.addSrcTrkorr(trkorr);
    }

    export async function readTmsQueue(target: components.TMSSYSNAM): Promise<struct.STMSIQREQ[]> {
        await checkSystemConnector();
        return systemConnector.readTmsQueue(target);
    }

    export async function createPackage(scompkdtln: struct.SCOMPKDTLN): Promise<void> {
        await checkSystemConnector();
        return systemConnector.createPackage(scompkdtln);
    }
    
    export async function getInstallPackages(packageName: string, registry: Registry): Promise<InstallPackage[]> {
        await checkSystemConnector();
        return systemConnector.getInstallPackages(packageName, registry);
    }
    
    export async function setPackageSuperpackage(devclass: DEVCLASS, superpackage: DEVCLASS): Promise<void> {
        await checkSystemConnector();
        return systemConnector.setPackageSuperpackage(devclass, superpackage);
    }
    
    export async function clearPackageSuperpackage(devclass: DEVCLASS): Promise<void> {
        await checkSystemConnector();
        return systemConnector.clearPackageSuperpackage(devclass);
    }
    
    export async function getMessage(data: SapMessage): Promise<string> {
        await checkSystemConnector();
        return systemConnector.getMessage(data);
    }
    
    export async function checkSapEntryExists(table: string, sapEntry: any): Promise<boolean> {
        await checkSystemConnector();
        return systemConnector.checkSapEntryExists(table, sapEntry);
    }
    
    export async function ping(): Promise<string> {
        await checkSystemConnector();
        return systemConnector.ping();
    }
    
    export async function getPackageIntegrity(oPackage: TrmPackage): Promise<string> {
        await checkSystemConnector();
        return systemConnector.getPackageIntegrity(oPackage);
    }

    export async function readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        await checkSystemConnector();
        return systemConnector.readTable(tableName, fields, options);
    }

    export async function getFileSystem(): Promise<struct.FILESYS> {
        await checkSystemConnector();
        return systemConnector.getFileSystem();
    }
    
    export async function getDirTrans(): Promise<components.PFEVALUE> {
        await checkSystemConnector();
        return systemConnector.getDirTrans();
    }
    
    export async function getBinaryFile(filePath: string): Promise<Buffer> {
        await checkSystemConnector();
        return systemConnector.getBinaryFile(filePath);
    }
    
    export async function writeBinaryFile(filePath: string, binary: Buffer): Promise<void> {
        await checkSystemConnector();
        return systemConnector.writeBinaryFile(filePath, binary);
    }
    
    export async function createTocTransport(text: components.AS4TEXT, target: components.TR_TARGET): Promise<components.TRKORR> {
        await checkSystemConnector();
        return systemConnector.createTocTransport(text, target);
    }
    
    export async function createWbTransport(text: components.AS4TEXT, target?: components.TR_TARGET): Promise<components.TRKORR> {
        await checkSystemConnector();
        return systemConnector.createWbTransport(text, target);
    }
    
    export async function setTransportDoc(trkorr: components.TRKORR, doc: struct.TLINE[]): Promise<void> {
        await checkSystemConnector();
        return systemConnector.setTransportDoc(trkorr, doc);
    }
    
    export async function addToTransportRequest(trkorr: components.TRKORR, content: struct.E071[], lock: boolean): Promise<void> {
        await checkSystemConnector();
        return systemConnector.addToTransportRequest(trkorr, content, lock);
    }
    
    export async function repositoryEnvironment(objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME): Promise<struct.SENVI[]> {
        await checkSystemConnector();
        return systemConnector.repositoryEnvironment(objectType, objectName);
    }
    
    export async function deleteTrkorr(trkorr: components.TRKORR): Promise<void> {
        await checkSystemConnector();
        return systemConnector.deleteTrkorr(trkorr);
    }

    export async function releaseTrkorr(trkorr: components.TRKORR, lock: boolean, timeout?: number): Promise<void> {
        await checkSystemConnector();
        return systemConnector.releaseTrkorr(trkorr, lock, timeout);
    }

    export async function addSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        await checkSystemConnector();
        return systemConnector.addSkipTrkorr(trkorr);
    }
    
    export async function trCopy(from: components.TRKORR, to: components.TRKORR, doc: boolean): Promise<void> {
        await checkSystemConnector();
        return systemConnector.trCopy(from, to, doc);
    }

    export async function getDefaultTransportLayer(): Promise<components.DEVLAYER> {
        await checkSystemConnector();
        return systemConnector.getDefaultTransportLayer();
    }
    
    export async function tadirInterface(tadir: struct.TADIR): Promise<void> {
        await checkSystemConnector();
        return systemConnector.tadirInterface(tadir);
    }
    
    export async function dequeueTransport(trkorr: components.TRKORR): Promise<void> {
        await checkSystemConnector();
        return systemConnector.dequeueTransport(trkorr);
    }
    
    export async function forwardTransport(trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean): Promise<void> {
        await checkSystemConnector();
        return systemConnector.forwardTransport(trkorr, target, source, importAgain);
    }
    
    export async function importTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        await checkSystemConnector();
        return systemConnector.importTransport(trkorr, system);
    }
    
    export async function setInstallDevc(installDevc: struct.ZTRM_INSTALLDEVC[]): Promise<void> {
        await checkSystemConnector();
        return systemConnector.setInstallDevc(installDevc);
    }
    
    export async function getObjectsList(): Promise<struct.KO100[]> {
        await checkSystemConnector();
        return systemConnector.getObjectsList();
    }
    
    export async function renameTransportRequest(trkorr: components.TRKORR, as4text: components.AS4TEXT): Promise<void> {
        await checkSystemConnector();
        return systemConnector.renameTransportRequest(trkorr, as4text);
    }
    
    export async function setPackageIntegrity(integrity: struct.ZTRM_INTEGRITY): Promise<void> {
        await checkSystemConnector();
        return systemConnector.setPackageIntegrity(integrity);
    }
    
    export async function addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void> {
        await checkSystemConnector();
        return systemConnector.addTranslationToTr(trkorr, devclassFilter);
    }

    export async function getFunctionModule(func: components.RS38L_FNAME): Promise<struct.TFDIR> {
        await checkSystemConnector();
        return systemConnector.getFunctionModule(func);
    }
}