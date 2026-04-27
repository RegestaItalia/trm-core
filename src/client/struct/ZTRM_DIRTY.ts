import { AS4TEXT, PGMID, TRKORR, TROBJ_NAME, TROBJTYPE } from "../components"

export type ZTRM_DIRTY = {
    trkorr: TRKORR,
    pgmid: PGMID,
    object: TROBJTYPE,
    objName: TROBJ_NAME,
    as4text: AS4TEXT
}