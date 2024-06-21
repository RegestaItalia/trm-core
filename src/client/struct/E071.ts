import { DDPOSITION, PGMID, TRKORR, TROBJTYPE, TROBJ_NAME } from "../components"

export type E071 = {
    trkorr?: TRKORR,
    as4pos?: DDPOSITION,
    pgmid: PGMID,
    object: TROBJTYPE,
    objName: TROBJ_NAME
}