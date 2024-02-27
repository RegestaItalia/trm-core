import { SENVI, TADIR } from "../../client";
import { IParser } from "../IParser";

export class OmSenviParser implements IParser {
    type = 'OM';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        //currently disabled
        //when using class, there's ClasSenviParser
        //however another case could be BAdi.
        //using a method of a BAdi is type OM
        return null;
    }
}