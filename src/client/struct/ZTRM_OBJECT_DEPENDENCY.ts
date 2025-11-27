import { DEVCLASS, TABNAME, ZTRM_PACKAGE_NAME, ZTRM_PACKAGE_REGISTRY } from "../components"

export type ZTRM_OBJECT_DEPENDENCY = {
    tabname: TABNAME,
    tabkey: string,
    devclass: DEVCLASS,
    trmPackageName: ZTRM_PACKAGE_NAME,
    trmPackageRegistry: ZTRM_PACKAGE_REGISTRY
}