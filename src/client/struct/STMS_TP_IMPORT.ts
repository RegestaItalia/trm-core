import { STMSCALERT } from "./STMSCALERT";
import { STMS_TR_REQUEST } from "./STMS_TR_REQUEST";
import { TPLOGPTR } from "./TPLOGPTR";
import { TPSTDOUT } from "./TPSTDOUT";

export type STMS_TP_IMPORT = {
    request: STMS_TR_REQUEST;
    tpRetCode: string;
    tpAlog: string;
    tpSlog: string;
    tpPid: string;
    tpStdout: TPSTDOUT[];
    tpLogptr: TPLOGPTR[];
    alert: STMSCALERT;
}
