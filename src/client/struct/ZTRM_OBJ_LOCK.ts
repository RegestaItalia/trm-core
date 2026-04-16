import { PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../components"

export type ZTRM_OBJ_LOCK = {
    pgmid: PGMID,
    object: TROBJTYPE,
    objName : SOBJ_NAME,
    trkorr: TRKORR
}