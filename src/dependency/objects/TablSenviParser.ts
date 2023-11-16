import { SENVI, TADIR } from "../../rfc/struct";
import { SystemConnector } from "../../systemConnector";
import { IParser } from "../IParser";

export class TablSenviParser implements IParser {
    type = 'TABL';
    
    constructor(public systemConnector: SystemConnector){ }

    public async parse(senvi: SENVI): Promise<TADIR> {
        return await this.systemConnector.getObject('R3TR', 'TABL', senvi.object);
    }
}