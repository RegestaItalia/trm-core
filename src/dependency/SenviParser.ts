import { SENVI } from "../client";
import { IParser, ParsedSenvi } from "./IParser";
import * as ObjectParsers from "./objects";

export class SenviParser {

    constructor() { }

    public async parse(senvi: SENVI): Promise<ParsedSenvi> {
        var parser: IParser;
        Object.keys(ObjectParsers).forEach((k) => {
            try {
                const instance: IParser = new ObjectParsers[k]();
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