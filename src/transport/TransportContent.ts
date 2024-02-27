import { TRKORR, TDEVC, TDEVCT, TADIR } from "../client"

export type TransportContent = {
    trkorr: TRKORR,
    tdevc: TDEVC[],
    tdevct: TDEVCT[],
    tadir: TADIR[]
}