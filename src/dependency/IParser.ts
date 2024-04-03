import { SEU_OBJ, SENVI, TADIR } from "../client";

export type ParsedSenvi = TADIR & {
    subObject?: {
        func?: string
    }
};

export interface IParser {
    type: SEU_OBJ,
    parse: (senvi: SENVI) => Promise<ParsedSenvi>
}