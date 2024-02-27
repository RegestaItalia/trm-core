import { SENVI, TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class ProgSenviParser implements IParser {
    type = 'PROG';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await SystemConnector.getObject('R3TR', 'PROG', senvi.object);
    }
}