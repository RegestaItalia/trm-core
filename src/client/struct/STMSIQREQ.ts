import { DDPOSITION, TRKORR } from "../components"

export type STMSIQREQ = {
    trkorr: TRKORR,
    bufpos: DDPOSITION,
    impsing: string,
    maxrc: string
}