import { DDOPTION, DDSIGN, DEVCLASS } from "../components";

export type LXE_TT_PACKG_LINE = {
    sign: DDSIGN,
    option: DDOPTION,
    low: DEVCLASS,
    high?: DEVCLASS,
}