import { PGMID, TROBJTYPE, SOBJ_NAME } from "../components"

export type ZTY_SER_OBJ = {
    pgmid: PGMID,
    object: TROBJTYPE,
    objName: SOBJ_NAME,
    fullPath: string
}