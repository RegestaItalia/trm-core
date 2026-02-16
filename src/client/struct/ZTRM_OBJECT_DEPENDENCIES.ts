import { PGMID, SOBJ_NAME, TROBJTYPE } from "../components"
import { ZTRM_OBJECT_DEPENDENCY } from "./ZTRM_OBJECT_DEPENDENCY"

export type ZTRM_OBJECT_DEPENDENCIES = {
  pgmid : PGMID,
  object : TROBJTYPE,
  objName : SOBJ_NAME,
  dependencies : ZTRM_OBJECT_DEPENDENCY[]
}
