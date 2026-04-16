import { PGMID, TRKORR, TROBJ_NAME, TROBJTYPE } from "../components"

export type ZTRM_DIRTY = {
    trkorr: TRKORR,
    pgmid: PGMID,
    object: TROBJTYPE,
    objName: TROBJ_NAME
}