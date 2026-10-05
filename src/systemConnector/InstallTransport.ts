import { TRKORR, ZTRM_INSTALLTR_TYPE } from "../client"

/** Transport imported by an installation, as read from the install transports table. */
export type InstallTransport = {
    trkorr: TRKORR,
    trmType: ZTRM_INSTALLTR_TYPE
}
