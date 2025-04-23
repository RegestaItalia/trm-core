import { SYMSGID, SYMSGNO, SYMSGTY, SYMSGV } from "../components";

export type SYMSG = {
    msgty: SYMSGTY,
    msgid: SYMSGID,
    msgno: SYMSGNO,
    msgv1?: SYMSGV,
    msgv2?: SYMSGV,
    msgv3?: SYMSGV,
    msgv4?: SYMSGV,
}