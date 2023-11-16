import { DEVCLASS, PGMID, RESPONSIBL, SOBJ_NAME, SRCSYSTEM, TROBJTYPE } from "../components"

export type TADIR = {
    pgmid: PGMID,
    object: TROBJTYPE,
    objName: SOBJ_NAME,
    devclass: DEVCLASS,
    genflag?: string,
    srcsystem?: SRCSYSTEM,
    author?: RESPONSIBL
}