import { SENVI, TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class TablSenviParser implements IParser {
    type = 'TABL';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await SystemConnector.getObject('R3TR', 'TABL', senvi.object);
    }
}