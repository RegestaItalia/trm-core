import { TRKORR } from "../components"

export type ZTY_TRM_PACKAGE = {
    name: string,
    version: string,
    registry: string,
    manifest: string,
    transport: {
        trkorr: TRKORR,
        migration: boolean
    }
}