import { E071, TADIR, TDEVC, TDEVCT } from "./struct";

/** Transport object and package metadata returned by the SAP transport API. */
export type TransportEntries = {
    e071: E071[],
    tdevc: TDEVC[],
    tdevct: TDEVCT[],
    tadir: TADIR[]
};
