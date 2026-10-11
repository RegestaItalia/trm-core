import { SYMSGID, SYMSGNO, SYMSGTY, SYMSGV, TMSSYSNAM } from "../components";

export type STMSCALERT = {
    id: string;
    domnam: string;
    sysnam: TMSSYSNAM;
    client: string;
    service: string;
    function: string;
    error: string;
    severity: string;
    text: string;
    msgid: SYMSGID;
    msgty: SYMSGTY;
    msgno: SYMSGNO;
    msgv1: SYMSGV;
    msgv2: SYMSGV;
    msgv3: SYMSGV;
    msgv4: SYMSGV;
    methodptr: string;
    properties: string;
}
