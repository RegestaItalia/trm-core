import { NATXT, SYDATUM, SYTIME, TRTPSTEP } from "../components"

export type TPSTAT = {
    message: NATXT;
    step: TRTPSTEP;
    moddate: SYDATUM;
    modtime: SYTIME;
}