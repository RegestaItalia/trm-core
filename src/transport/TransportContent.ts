import { TRKORR } from "../rfc/components"
import { TADIR, TDEVC, TDEVCT } from "../rfc/struct"

export type TransportContent = {
    trkorr: TRKORR,
    tdevc: TDEVC[],
    tdevct: TDEVCT[],
    tadir: TADIR[]
}