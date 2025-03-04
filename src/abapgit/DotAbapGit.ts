import { DEVCLASS } from "../client";
import { SystemConnector } from "../systemConnector";
import * as xml from "xml-js";

export class DotAbapGit {
    private _dotAbapgit: {
        MASTER_LANGUAGE?: any,
        STARTING_FOLDER?: {
            item: {
                _text: string
            }
        },
        FOLDER_LOGIC?: any,
        IGNORE?: {
            item: {
                _text: string
            } | {
                _text:string
            }[]
        },
        VERSION_CONSTANT?: any
    };

    private constructor(sXml: string) {
        try{
            this._dotAbapgit = xml.xml2js(sXml, { compact: true })['asx:abap']['asx:values']['DATA'];
        }catch(e){
            throw new Error(`Couldn't parse .abapgit.xml`);
        }
    }

    public static async fromDevclass(devclass: DEVCLASS): Promise<DotAbapGit> {
        const xml = await SystemConnector.getDotAbapgit(devclass);
        return new DotAbapGit(xml.toString());
    }

    public getIgnoredFiles(): string[] {
        if(this._dotAbapgit.IGNORE && this._dotAbapgit.IGNORE.item){
            if(Array.isArray(this._dotAbapgit.IGNORE.item)){
                return this._dotAbapgit.IGNORE.item.map(o => o._text);
            }else{
                return [this._dotAbapgit.IGNORE.item._text];
            }
        }else{
            return [];
        }
    }

    public getStartingFolder(): string {
        return this._dotAbapgit.STARTING_FOLDER ? this._dotAbapgit.STARTING_FOLDER.item._text : null;
    }

}