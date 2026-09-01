import { SYDATUM, SYTIME, TRKORR, TRTPSTEP, TR_AS4USER } from "../components";

export type TPLOGPTR = {
    trkorr: TRKORR;
    owner: TR_AS4USER;
    sysname: string;
    step: TRTPSTEP;
    retcode: string;
    logdate: SYDATUM;
    logtime: SYTIME;
    osuser: TR_AS4USER;
    hostname: string;
    client: string;
}
