import { SENVI, TADIR } from "../../rfc/struct";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class ViewSenviParser implements IParser {
    type = 'VIEW';
    
    constructor(public systemConnector: SystemConnector){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await this.systemConnector.getObject('R3TR', 'VIEW', senvi.object);
    }
}