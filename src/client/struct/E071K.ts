import { PGMID, TRKORR, TROBJTYPE, TROBJ_NAME } from "../components"

export type E071K = {
    trkorr?: TRKORR,
    pgmid: PGMID,
    object: TROBJTYPE,
    objname: TROBJ_NAME,
    mastertype?: TROBJTYPE,
    mastername?: TROBJ_NAME
}
