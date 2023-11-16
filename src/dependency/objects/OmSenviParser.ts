import { SENVI, TADIR } from "../../rfc/struct";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class OmSenviParser implements IParser {
    type = 'OM';
    
    constructor(public systemConnector: SystemConnector){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        //currently disabled
        //when using class, there's ClasSenviParser
        //however another case could be BAdi.
        //using a method of a BAdi is type OM
        return null;
    }
}