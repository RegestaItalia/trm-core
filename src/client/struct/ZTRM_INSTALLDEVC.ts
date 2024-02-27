import { DEVCLASS, ZTRM_PACKAGE_NAME, ZTRM_PACKAGE_REGISTRY } from "../components";

export type ZTRM_INSTALLDEVC = {
    package_name: ZTRM_PACKAGE_NAME,
    package_registry: ZTRM_PACKAGE_REGISTRY,
    original_devclass: string,
    install_devclass: DEVCLASS
}
