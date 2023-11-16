import { SENVI, TADIR } from "../rfc/struct";
import { SystemConnector } from "../systemConnector";
import { IParser } from "./IParser";
import * as ObjectParsers from "./objects";

export class SenviParser {

    constructor(private _systemConnector: SystemConnector) { }

    public async parse(senvi: SENVI): Promise<TADIR> {
        var parser: IParser;
        Object.keys(ObjectParsers).forEach((k) => {
            try {
                const instance: IParser = new ObjectParsers[k](this._systemConnector);
                if (instance.type === senvi.type.trim().toUpperCase()) {
                    parser = instance
                }
            } catch (e) {
                //don't throw
            };
        });
        if(parser){
            return await parser.parse(senvi);
        }else{
            return null;
        }
    }
}