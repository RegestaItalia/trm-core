import { DLVUNIT, RELC_TYPE, SAPPATCHLV, SAPRELEASE } from "../components"

export type CVERS = {
    component: DLVUNIT,
    release: SAPRELEASE,
    extrelease: SAPPATCHLV,
    compType: RELC_TYPE
}
