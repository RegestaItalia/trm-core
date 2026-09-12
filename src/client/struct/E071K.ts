import { PGMID, TRKORR, TROBJTYPE, TROBJ_NAME } from "../components"

export type E071K = {
    trkorr?: TRKORR,
    pgmid: PGMID,
    object: TROBJTYPE,
    objName: TROBJ_NAME
}
