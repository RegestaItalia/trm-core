import { SystemConnector } from "../systemConnector";
import { TrmManifestPostActivity } from "./TrmManifestPostActivity";
import * as xml from "xml-js";
import { Logger } from "trm-commons";
import { SEOCLASSTX } from "../client";

export class PostActivity {

    private _xml: string;
    private _descriptions: SEOCLASSTX[];

    constructor(public data: TrmManifestPostActivity) {
        this._xml = this.getAbapXml(this.data);
        if (!this._xml) {
            throw new Error(`Can't parse post activity.`);
        }
    }

    public async execute(silent?: boolean) {
        Logger.loading(`Executing post activity: ${this.data.name}`, silent);
        if(!PostActivity.exists(this.data.name)){
            throw new Error(`Class "${this.data.name}" doesn't exist.`);
        }
        const description = await this.getDescription();
        Logger.loading(`Executing post activity: ${description}`, silent);
        const messages = await SystemConnector.executePostActivity(Buffer.from(this._xml, 'utf8'));
        if (messages && messages.length > 0) {
            for (const message of messages) {
                const parsedMessage = await SystemConnector.getMessage({
                    class: message.msgid,
                    no: message.msgno,
                    v1: message.msgv1,
                    v2: message.msgv2,
                    v3: message.msgv3,
                    v4: message.msgv4,
                });
                Logger.msgty(message.msgty, parsedMessage, silent);
            }
        } else {
            Logger.success(`Executed post activity: ${description}`, silent);
        }
    }

    public async getDescription(): Promise<string> {
        if (this._descriptions === undefined) {
            this._descriptions = await SystemConnector.readClassDescriptions(this.data.name);
        }
        if (!this._descriptions || this._descriptions.length === 0) {
            return this.data.name || `Unknown`;
        } else {
            if (this._descriptions.find(o => o.langu === SystemConnector.getLogonLanguage(true))) {
                return this._descriptions.find(o => o.langu === SystemConnector.getLogonLanguage(true)).descript;
            } else {
                return this._descriptions[0].descript;
            }
        }
    }

    private getAbapXml(data: TrmManifestPostActivity): string {
        var oAbapXml = {
            "_declaration": {
                "_attributes": {
                    "version": "1.0",
                    "encoding": "utf-8"
                }
            },
            "asx:abap": {
                "_attributes": {
                    "xmlns:asx": "http://www.sap.com/abapxml",
                    "version": "1.0"
                },
                "asx:values": {
                    "DATA": {
                        "NAME": {
                            "_text": data.name
                        }
                    }
                }
            }
        };
        if (Array.isArray(data.parameters)) {
            var parameters = data.parameters.map(param => {
                return {
                    "NAME": {
                        "_text": param.name
                    },
                    "VALUE": {
                        "_text": param.value || ''
                    }
                }
            });
            if (parameters.length > 0) {
                oAbapXml['asx:abap']['asx:values']['DATA']['PARAMETERS'] = {
                    "item": parameters
                }
            }
        }
        return xml.js2xml(oAbapXml, { compact: true });
    }

    public static async exists(className: string): Promise<boolean> {
        const classObject = SystemConnector.getObject('R3TR', 'CLAS', className.trim().toUpperCase());
        return classObject ? true : false;
    }

}