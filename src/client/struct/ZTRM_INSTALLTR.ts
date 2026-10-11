import { TRKORR, ZTRM_INSTALLTR_TYPE, ZTRM_PACKAGE_NAME, ZTRM_PACKAGE_REGISTRY } from "../components";

/** Transport imported by an installation, as recorded in `/ATRM/INSTALLTR`. */
export type ZTRM_INSTALLTR = {
    package_name: ZTRM_PACKAGE_NAME,
    package_registry: ZTRM_PACKAGE_REGISTRY,
    trkorr: TRKORR,
    trm_type: ZTRM_INSTALLTR_TYPE
}
