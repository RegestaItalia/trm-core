import { AS4TEXT, DEVCLASS, DLVUNIT, PARENTCL, TPCLASS } from "../components"

export type TDEVC = {
    devclass: DEVCLASS,
    parentcl: PARENTCL,
    tpclass: TPCLASS,
    dlvunit: DLVUNIT,
    ctext?: AS4TEXT
}