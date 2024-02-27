import { SENVI, TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class ClasSenviParser implements IParser {
    type = 'CLAS';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await SystemConnector.getObject('R3TR', 'CLAS', senvi.object);
    }
}