import { SENVI } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { IParser, ParsedSenvi } from "../IParser";

export class FuncSenviParser implements IParser {
    type = 'FUNC';
    
    constructor(){ }

    public async parse(senvi: SENVI): Promise<ParsedSenvi> {
        const tfdir = await SystemConnector.getFunctionModule(senvi.object);
        if(tfdir){
            const fugr = await SystemConnector.getObject('R3TR', 'FUGR', tfdir.pname.replace(/^SAPL/gmi, ''));
            if(fugr){
                return {...fugr, ...{
                    subObject: {
                        func: tfdir.funcname
                    }
                }};
            }
        }
    }
}