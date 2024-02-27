import { SEU_OBJ, SENVI, TADIR } from "../client";

export interface IParser {
    type: SEU_OBJ,
    parse: (senvi: SENVI) => Promise<TADIR>
}