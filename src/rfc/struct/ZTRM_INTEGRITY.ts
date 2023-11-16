import { ZTRM_PACKAGE_INTEGRITY, ZTRM_PACKAGE_NAME, ZTRM_PACKAGE_REGISTRY } from "../components"

export type ZTRM_INTEGRITY = {
    package_name: ZTRM_PACKAGE_NAME,
    package_registry: ZTRM_PACKAGE_REGISTRY,
    integrity: ZTRM_PACKAGE_INTEGRITY
}
