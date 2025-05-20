import { TRKORR } from "../components"
import { TDEVC } from "./TDEVC"

export type ZTY_TRM_PACKAGE = {
    name: string,
    version: string,
    registry?: string,
    manifest?: string,
    tdevc: TDEVC[],
    transport: {
        trkorr?: TRKORR,
        migration?: boolean
    }
}