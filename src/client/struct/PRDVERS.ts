import { BORM_ID, BORM_NAME, BORM_NAMEL, BORM_VEND, BORM_VERS, INSTSTATE } from "../components"

export type PRDVERS = {
    id: BORM_ID,
    name: BORM_NAME,
    version: BORM_VERS,
    vendor: BORM_VEND,
    descript: BORM_NAMEL,
    inststatus: INSTSTATE
}
