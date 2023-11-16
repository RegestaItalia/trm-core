import { SEU_OBJ, TROBJTYPE } from "../rfc/components";
import { SENVI, TADIR } from "../rfc/struct";
import { SystemConnector } from "../systemConnector";

export interface IParser {
    type: SEU_OBJ,
    systemConnector: SystemConnector,
    parse: (senvi: SENVI) => Promise<TADIR>
}