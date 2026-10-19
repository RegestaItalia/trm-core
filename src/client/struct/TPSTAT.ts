import { NATXT, SYDATUM, SYTIME, TRKORR, TRTPSTEP } from "../components"

export type TPSTAT = {
    message: NATXT;
    step: TRTPSTEP;
    moddate: SYDATUM;
    modtime: SYTIME;
    /** Request the status row belongs to. */
    trkorr?: TRKORR;
    /** tp command status: R running, F finished. */
    status?: string;
    /** tp return code, `8888` while running. */
    retcode?: string;
    command?: string;
}
