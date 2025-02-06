import { AS4DATE, AS4TIME, TRKORR, TRFUNCTION, TRSTATUS } from "../components"

export type E070 = {
    trkorr: TRKORR,
    trfunction: TRFUNCTION,
    trstatus: TRSTATUS,
    as4Date: AS4DATE,
    as4Time: AS4TIME
}