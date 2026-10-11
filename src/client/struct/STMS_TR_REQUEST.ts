import { TRKORR, TR_AS4USER } from "../components";

export type STMS_TR_REQUEST = {
    trkorr: TRKORR;
    tarcli: string;
    project: TRKORR;
    preflg: string;
    owner: TR_AS4USER;
}
