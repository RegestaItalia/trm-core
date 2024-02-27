import { SENVI, TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class DtelSenviParser implements IParser {
    type = 'DTEL';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await SystemConnector.getObject('R3TR', 'DTEL', senvi.object);
    }
}