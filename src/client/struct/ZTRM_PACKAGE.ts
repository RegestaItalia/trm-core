import { AS4DATE, AS4TIME, DEVCLASS, TRKORR, ZTRM_PACKAGE_INTEGRITY, ZTRM_PACKAGE_NAME, ZTRM_PACKAGE_REGISTRY } from "../components"
import { ZTRM_DIRTY } from "./ZTRM_DIRTY"

export interface ZTRM_PACKAGE {
    packageName: ZTRM_PACKAGE_NAME,
    packageRegistry: ZTRM_PACKAGE_REGISTRY,
    manifest: string,
    trkorr: TRKORR,
    as4Date: AS4DATE,
    as4Time: AS4TIME,
    integrity: ZTRM_PACKAGE_INTEGRITY,
    dirty: ZTRM_DIRTY[],
    devclass: DEVCLASS,
    packages: DEVCLASS[]
}