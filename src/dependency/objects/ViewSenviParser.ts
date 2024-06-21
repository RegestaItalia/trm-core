import { SENVI, TADIR } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class ViewSenviParser implements IParser {
    type = 'VIEW';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await SystemConnector.getObject('R3TR', 'VIEW', senvi.object);
    }
}