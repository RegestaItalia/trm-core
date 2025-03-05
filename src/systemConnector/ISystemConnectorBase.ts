import { AbstractRegistry, Registry } from "../registry";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { InstallPackage } from "./InstallPackage";

export interface ISystemConnectorBase {
    getTransportStatus: (trkorr: components.TRKORR) => Promise<string>,
    getPackageWorkbenchTransport: (oPackage: TrmPackage) => Promise<Transport>,
    getSourceTrkorr: () => Promise<components.TRKORR[]>,
    getIgnoredTrkorr: () => Promise<components.TRKORR[]>,
    getObject: (pgmid: components.PGMID, object: components.TROBJTYPE, objName: components.SOBJ_NAME) => Promise<struct.TADIR>,
    getInstalledPackages: (includeSoruces: boolean, refresh?: boolean, includeLocals?: boolean) => Promise<TrmPackage[]>,
    getDevclass: (devclass: components.DEVCLASS) => Promise<struct.TDEVC>,
    getTransportTargets: () => Promise<struct.TMSCSYS[]>,
    getSubpackages: (devclass: components.DEVCLASS) => Promise<struct.TDEVC[]>,
    getDevclassObjects: (devclass: components.DEVCLASS, includeSubpackages: boolean) => Promise<struct.TADIR[]>,
    getInstallPackages: (packageName: string, registry: AbstractRegistry) => Promise<InstallPackage[]>,
    setPackageSuperpackage: (devclass: components.DEVCLASS, superpackage: components.DEVCLASS) => Promise<void>,
    clearPackageSuperpackage: (devclass: components.DEVCLASS) => Promise<void>,
    setPackageTransportLayer: (devclass: components.DEVCLASS, devlayer: components.DEVLAYER) => Promise<void>,
    checkSapEntryExists: (table: string, sapEntry: any) => Promise<boolean>,
    getPackageIntegrity: (oPackage: TrmPackage) => Promise<string>,
    getFunctionModule: (func: components.RS38L_FNAME) => Promise<struct.TFDIR>,
    getExistingObjects: (objects: struct.TADIR[]) => Promise<struct.TADIR[]>,
    getNamespace: (namespace: components.NAMESPACE) => Promise<{
        trnspacet: struct.TRNSPACET,
        trnspacett: struct.TRNSPACETT[]
    }>,
    getR3transVersion: () => Promise<string>,
    getR3transUnicode: () => Promise<boolean>,
    isTransportLayerExist: (devlayer: components.DEVLAYER) => Promise<boolean>,
    getTrmServerPackage: () => Promise<TrmPackage>,
    getTrmRestPackage: () => Promise<TrmPackage>
}