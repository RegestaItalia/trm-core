import * as components from "./components";
import * as struct from "./struct";
import { IClient } from "./IClient";
import { getNpmGlobalPath, normalize } from "../commons";
import { Logger } from "../logger";
import { existsSync } from "fs";
import path from "path";
import { SapMessage } from ".";

const nodeRfcLib = 'node-rfc';

export class RFCClient implements IClient {
    private _rfcClient: any;
    private _aliveCheck: boolean = false;

    constructor(private _rfcClientArgs: any, private _cLangu: string, traceDir?: string) {
        try{
            process.env["RFC_TRACE_DIR"] = traceDir || process.cwd();
        }catch(e){
            //not sure if this could cause an error!
            Logger.warning(`Couldn't set RFC trace!`, true);
            Logger.error(e.toString(), true);
        }
        Logger.log(`RFC_TRACE_DIR: ${process.env["RFC_TRACE_DIR"]}`, true);
    }

    private async getRfcClient(): Promise<any> {
        if (!this._rfcClient) {
            const globalPath = await getNpmGlobalPath();
            const libPath = path.join(globalPath, nodeRfcLib);
            Logger.log(`Node RFC lib path: ${libPath}`, true);
            if (!existsSync(libPath)) {
                throw new Error(`${nodeRfcLib} not found. Run command "npm install ${nodeRfcLib} -g" to continue.`);
            }
            this._rfcClient = new (await import(libPath)).Client(this._rfcClientArgs);
        }
        return this._rfcClient;
    }

    public async open() {
        Logger.loading(`Opening RFC connection`, true);
        await (await this.getRfcClient()).open();
        Logger.success(`RFC open`, true);
    }

    public async checkConnection(): Promise<boolean> {
        if (!this._aliveCheck) {
            if ((await this.getRfcClient()).alive) {
                Logger.success(`RFC open`, true);
            } else {
                Logger.warning(`RFC closed`, true);
            }
            this._aliveCheck = true;
        }
        return (await this.getRfcClient()).alive;
    }

    private async _call(fm: any, arg?: any, timeout?: number, noErrorParsing?: boolean): Promise<any> {
        var argNormalized;
        if (arg) {
            var emptyKeys = [];
            argNormalized = normalize(arg, 'upper');
            Object.keys(argNormalized).forEach(key => {
                if (argNormalized[key] === undefined || argNormalized === null) {
                    emptyKeys.push(key);
                }
            });
            emptyKeys.forEach(key => {
                delete argNormalized[key];
            });
        } else {
            argNormalized = {};
        }
        var callOptions = undefined;
        if (timeout) {
            callOptions = {
                timeout
            };
        }
        try {
            Logger.loading(`Executing RFC, FM ${fm}, args ${JSON.stringify(argNormalized)}, opts ${JSON.stringify(callOptions)}`, true);
            const response = await (await this.getRfcClient()).call(fm, argNormalized, callOptions);
            const responseNormalized = normalize(response);
            Logger.success(`RFC resonse: ${JSON.stringify(responseNormalized)}`, true);
            return responseNormalized;
        } catch (e) {
            if(noErrorParsing){
                throw e;
            }else{
                var message: string;
                var messageError;
                try{
                    message = await this._getMessage(true, {
                        no: `${e.abapMsgNumber}`,
                        class: e.abapMsgClass,
                        v1: e.abapMsgV1,
                        v2: e.abapMsgV2,
                        v3: e.abapMsgV3,
                        v4: e.abapMsgV4
                    });
                }catch(k){
                    messageError = k;
                    message = `Couldn't read error message ${e.abapMsgClass} ${e.abapMsgNumber} ${e.abapMsgV1} ${e.abapMsgV2} ${e.abapMsgV3} ${e.abapMsgV4}`;
                }
                var rfcClientError: any = new Error(message.trim());
                rfcClientError.name = 'TrmRFCClient';
                rfcClientError.rfcError = e;
                if(messageError){
                    rfcClientError.messageError = messageError;
                }
                Logger.error(rfcClientError.toString(), true);
                throw rfcClientError;
            }
        }
    }

    private async _getMessage(noErrorParsing: boolean, data: SapMessage): Promise<string> {
        var msgnr = data.no;
        while (msgnr.length < 3) {
            msgnr = `0${msgnr}`;
        }
        const aT100: struct.T100[] = await this._readTable(noErrorParsing, 'T100',
            [{ fieldName: 'SPRSL' }, { fieldName: 'ARBGB' }, { fieldName: 'MSGNR' }, { fieldName: 'TEXT' }],
            `SPRSL EQ '${this._cLangu}' AND ARBGB EQ '${data.class}' AND MSGNR EQ '${msgnr}'`
        );
        if (aT100.length === 1 && aT100[0].text) {
            var msg = aT100[0].text;
            msg = msg.replace("&1", data.v1 || '');
            msg = msg.replace("&2", data.v2 || '');
            msg = msg.replace("&3", data.v3 || '');
            msg = msg.replace("&4", data.v4 || '');
            return msg.trim();
        } else {
            throw new Error(`Message ${msgnr}, class ${data.class}, lang ${this._cLangu} not found.`);
        }
    }

    public async getMessage(data: SapMessage): Promise<string> {
        return this._getMessage(false, data);
    }

    private async _readTable(noErrorParsing: boolean, tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        var sqlOutput = [];
        const delimiter = '|';
        var aOptions: struct.RFC_DB_OPT[] = [];
        if (options) {
            //line must not exceede 72 chars length
            //it must not break on an operator
            const aSplit = options.split(/\s+AND\s+/);
            if (aSplit.length > 1) {
                aSplit.forEach((s, i) => {
                    var sText = s.trim();
                    if (i !== 0) {
                        sText = `AND ${sText}`;
                    }
                    aOptions.push({ text: sText });
                })
            } else {
                aOptions = aSplit.map(s => {
                    return {
                        text: s
                    }
                });
            }
            /*aOptions = (options.match(/.{1,72}/g)).map(s => {
                return {
                    text: s
                }
            }) || [];*/
        }
        const result = await this._call("RFC_READ_TABLE", {
            query_table: tableName.toUpperCase(),
            delimiter,
            options: aOptions,
            fields: fields
        }, undefined, noErrorParsing);
        const data: struct.TAB512[] = result['data'];
        data.forEach(tab512 => {
            var sqlLine: any = {};
            const waSplit = tab512.wa.split(delimiter);
            fields.forEach((field, index) => {
                sqlLine[field['FIELDNAME']] = waSplit[index].trim();
            });
            sqlOutput.push(sqlLine);
        })
        return normalize(sqlOutput);
    }

    public async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        return this._readTable(false, tableName, fields, options);
    }

    public async getFileSystem(): Promise<struct.FILESYS> {
        const result = await this._call("ZTRM_GET_FILE_SYS", {});
        return result['evFileSys'];
    }

    public async getDirTrans(): Promise<components.PFEVALUE> {
        const result = await this._call("ZTRM_GET_DIR_TRANS", {});
        return result['evDirTrans'];
    }

    public async getBinaryFile(filePath: string): Promise<Buffer> {
        const result = await this._call("ZTRM_GET_BINARY_FILE", {
            iv_file_path: filePath
        });
        return result['evFile'];
    }

    public async writeBinaryFile(filePath: string, binary: Buffer): Promise<void> {
        await this._call("ZTRM_WRITE_BINARY_FILE", {
            iv_file_path: filePath,
            iv_file: binary
        });
    }

    public async createTocTransport(text: components.AS4TEXT, target: components.TR_TARGET): Promise<components.TRKORR> {
        const result = await this._call("ZTRM_CREATE_TOC", {
            iv_text: text,
            iv_target: target.trim().toUpperCase()
        });
        return result['evTrkorr'];
    }

    public async createWbTransport(text: components.AS4TEXT, target?: components.TR_TARGET): Promise<components.TRKORR> {
        const result = await this._call("ZTRM_CREATE_IMPORT_TR", {
            iv_text: text,
            iv_target: target.trim().toUpperCase()
        });
        return result['evTrkorr'];
    }

    public async setTransportDoc(trkorr: components.TRKORR, doc: struct.TLINE[]): Promise<void> {
        await this._call("ZTRM_SET_TRANSPORT_DOC", {
            iv_trkorr: trkorr.trim().toUpperCase(),
            it_doc: doc
        });
    }

    public async getDevclassObjects(devclass: components.DEVCLASS): Promise<struct.TADIR[]> {
        const result = await this._call("ZTRM_GET_DEVCLASS_OBJS", {
            iv_devclass: devclass.trim().toUpperCase()
        });
        return result['etTadir'];
    }

    public async addToTransportRequest(trkorr: components.TRKORR, content: struct.E071[], lock: boolean): Promise<void> {
        await this._call("ZTRM_ADD_OBJS_TR", {
            iv_lock: lock ? 'X' : ' ',
            iv_trkorr: trkorr.trim().toUpperCase(),
            it_e071: content.map(o => {
                return {
                    PGMID: o.pgmid,
                    OBJECT: o.object,
                    OBJ_NAME: o.objName
                }
            })
        });
    }

    public async repositoryEnvironment(objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME): Promise<struct.SENVI[]> {
        const result = await this._call("REPOSITORY_ENVIRONMENT_RFC", {
            obj_type: objectType.trim().toUpperCase(),
            object_name: objectName.trim().toUpperCase()
        });
        return result['environmentTab'];
    }

    public async deleteTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._call("ZTRM_DELETE_TRANSPORT", {
            iv_trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async releaseTrkorr(trkorr: components.TRKORR, lock: boolean, timeout?: number): Promise<void> {
        await this._call("ZTRM_RELEASE_TR", {
            iv_trkorr: trkorr.trim().toUpperCase(),
            iv_lock: lock ? 'X' : ' '
        }, timeout);
    }

    public async addSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._call("ZTRM_ADD_SKIP_TRKORR", {
            iv_trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async addSrcTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._call("ZTRM_ADD_SRC_TRKORR", {
            iv_trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async readTmsQueue(target: components.TMSSYSNAM): Promise<struct.STMSIQREQ[]> {
        const result = await this._call("ZTRM_READ_TMS_QUEUE", {
            iv_target: target
        });
        return result['etRequests'];
    }

    public async createPackage(scompkdtln: struct.SCOMPKDTLN): Promise<void> {
        await this._call("ZTRM_CREATE_PACKAGE", {
            is_data: scompkdtln
        });
    }

    public async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean, devlayer?: components.DEVLAYER): Promise<void> {
        await this._call("ZTRM_TDEVC_INTERFACE", {
            iv_devclass: devclass.trim().toUpperCase(),
            iv_parentcl: parentcl ? parentcl.trim().toUpperCase() : '',
            iv_rm_parentcl: rmParentCl ? 'X' : ' ',
            iv_devlayer: devlayer ? devlayer.trim().toUpperCase() : ''
        });
    }

    public async getDefaultTransportLayer(): Promise<components.DEVLAYER> {
        const result = await this._call("ZTRM_GET_TRANSPORT_LAYER");
        return result['evLayer'];
    }

    public async tadirInterface(tadir: struct.TADIR): Promise<void> {
        await this._call("ZTRM_TADIR_INTERFACE", {
            iv_pgmid: tadir.pgmid,
            iv_object: tadir.object,
            iv_obj_name: tadir.objName,
            iv_devclass: tadir.devclass,
            iv_set_genflag: tadir.genflag ? 'X' : ' ',
            iv_srcsystem: tadir.srcsystem
        });
    }

    public async dequeueTransport(trkorr: components.TRKORR): Promise<void> {
        await this._call("ZTRM_DEQUEUE_TR", {
            iv_trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async forwardTransport(trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean = true): Promise<void> {
        await this._call("ZTRM_FORWARD_TR", {
            iv_trkorr: trkorr.trim().toUpperCase(),
            iv_target: target.trim().toUpperCase(),
            iv_source: source.trim().toUpperCase(),
            iv_import_again: importAgain ? 'X' : ' '
        });
    }

    public async importTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        await this._call("ZTRM_IMPORT_TR", {
            iv_system: system.trim().toUpperCase(),
            iv_trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async setInstallDevc(installDevc: struct.ZTRM_INSTALLDEVC[]): Promise<void> {
        await this._call("ZTRM_SET_INSTALL_DEVC", {
            it_installdevc: installDevc
        });
    }

    public async getObjectsList(): Promise<struct.KO100[]> {
        const result = await this._call("ZTRM_LIST_OBJECT_TYPES");
        return result['etObjectText'];
    }

    public async getTrmServerVersion(): Promise<string> {
        const result = await this._call("ZTRM_VERSION");
        return result['evVersion'];
    }

    public async getTrmRestVersion(): Promise<string> {
        const result = await this._call("ZTRM_VERSION");
        return result['evRest'];
    }

    public async trmServerPing(): Promise<string> {
        const result = await this._call("ZTRM_PING");
        return result['evReturn'];
    }

    public async renameTransportRequest(trkorr: components.TRKORR, as4text: components.AS4TEXT): Promise<void> {
        await this._call("ZTRM_RENAME_TRANSPORT_REQUEST", {
            iv_trkorr: trkorr.trim().toUpperCase(),
            iv_as4text: as4text
        });
    }

    public async setPackageIntegrity(integrity: struct.ZTRM_INTEGRITY): Promise<void> {
        await this._call("ZTRM_SET_INTEGRITY", {
            is_integrity: integrity
        });
    }

    public async addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void> {
        await this._call("ZTRM_ADD_LANG_TR", {
            iv_trkorr: trkorr,
            it_devclass: devclassFilter
        });
    }

    public async trCopy(from: components.TRKORR, to: components.TRKORR, doc: boolean = false): Promise<void> {
        await this._call("ZTRM_TR_COPY", {
            iv_from: from,
            iv_to: to,
            iv_doc: doc ? 'X' : ' '
        });
    }

    public async addNamespace(namespace: components.NAMESPACE, replicense: components.TRNLICENSE, texts: struct.TRNSPACETT[]): Promise<void> {
        await this._call("ZTRM_ADD_NAMESPACE", {
            iv_namespace: namespace,
            iv_replicense: replicense,
            it_texts: texts
        });
    }

    public async getR3transInfo(): Promise<string> {
        const result = await this._call("ZTRM_GET_R3TRANS_INFO");
        return result['evLog'];
    }

}