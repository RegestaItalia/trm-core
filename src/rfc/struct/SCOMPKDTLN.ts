import { AS4TEXT, DEVCLASS, DEVLAYER, DLVUNIT, PACKAUTHOR } from "../components"

export type SCOMPKDTLN = {
    devclass: DEVCLASS,
    ctext: AS4TEXT,
    as4user: PACKAUTHOR,
    dlvunit: DLVUNIT,
    pdevclass: DEVLAYER
}