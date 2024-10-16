import { Registry } from "../registry";
import { DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../client/components";
import { TADIR, TDEVC, TMSCSYS } from "../client/struct";
import { Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { InstallPackage } from "./InstallPackage";
import { SapMessage } from "./SapMessage";
import * as components from "../client/components";
import * as struct from "../client/struct";

export interface ISystemConnectorBase {
    getTransportStatus: (trkorr: TRKORR) => Promise<string>,
    getPackageWorkbenchTransport: (oPackage: TrmPackage) => Promise<Transport>,
    getSourceTrkorr: () => Promise<TRKORR[]>,
    getIgnoredTrkorr: () => Promise<TRKORR[]>,
    getObject: (pgmid: PGMID, object: TROBJTYPE, objName: SOBJ_NAME) => Promise<TADIR>,
    getInstalledPackages: (includeSoruces: boolean, refresh?: boolean) => Promise<TrmPackage[]>,
    getDevclass: (devclass: DEVCLASS) => Promise<TDEVC>,
    getTransportTargets: () => Promise<TMSCSYS[]>,
    getSubpackages: (devclass: DEVCLASS) => Promise<TDEVC[]>,
    getDevclassObjects: (devclass: components.DEVCLASS, includeSubpackages: boolean) => Promise<struct.TADIR[]>,
    getInstallPackages: (packageName: string, registry: Registry) => Promise<InstallPackage[]>,
    setPackageSuperpackage: (devclass: DEVCLASS, superpackage: DEVCLASS) => Promise<void>,
    clearPackageSuperpackage: (devclass: DEVCLASS) => Promise<void>,
    getMessage: (data: SapMessage) => Promise<string>,
    checkSapEntryExists: (table: string, sapEntry: any) => Promise<boolean>,
    getPackageIntegrity: (oPackage: TrmPackage) => Promise<string>,
    getFunctionModule: (func: components.RS38L_FNAME) => Promise<struct.TFDIR>
}