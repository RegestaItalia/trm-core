import * as noderfc from "node-rfc";
import * as components from "./components";
import * as struct from "./struct";
import { IClient } from "./IClient";
import { normalize } from "../commons";
import { Logger } from "../logger";

export class RFCClient implements IClient {
    private _rfcClient: noderfc.Client;
    private _aliveCheck: boolean = false;

    constructor(arg1: any, traceDir?: string) {
        process.env["RFC_TRACE_DIR"] = traceDir || process.cwd();
        Logger.log(`RFC_TRACE_DIR: ${process.env["RFC_TRACE_DIR"]}`, true);
        this._rfcClient = new noderfc.Client(arg1);
    }

    public async open() {
        Logger.loading(`Opening RFC connection`, true);
        await this._rfcClient.open();
        Logger.success(`RFC open`, true);
    }

    public async checkConnection(): Promise<boolean> {
        if(!this._aliveCheck){
            if(this._rfcClient.alive){
                Logger.success(`RFC open`, true);
            }else{
                Logger.warning(`RFC closed`, true);
            }
            this._aliveCheck = true;
        }
        return this._rfcClient.alive;
    }

    private async _call(fm: any, arg?: any, timeout?: number): Promise<any> {
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
        if(timeout){
            callOptions = {
                timeout
            };
        }
        Logger.loading(`Executing RFC, FM ${fm}, args ${JSON.stringify(argNormalized)}, opts ${JSON.stringify(callOptions)}`, true);
        const response = await this._rfcClient.call(fm, argNormalized, callOptions);
        const responseNormalized = normalize(response);
        Logger.success(`RFC resonse: ${JSON.stringify(responseNormalized)}`, true);
        return responseNormalized;
    }

    public async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        var sqlOutput = [];
        const delimiter = '|';
        var aOptions: struct.RFC_DB_OPT[] = [];
        if (options) {
            //line must not exceede 72 chars length
            //it must not break on an operator
            const aSplit = options.split(/\s+AND\s+/);
            if(aSplit.length > 1){
                aSplit.forEach((s, i) => {
                    var sText = s.trim();
                    if(i !== 0){
                        sText = `AND ${sText}`;
                    }
                    aOptions.push({ text: sText });
                })
            }else{
                aOptions = aSplit.map(s => {
                    return {
                        text: s
                    }
                }) ;
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
        });
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
            iv_target: target
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

    public async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean): Promise<void> {
        await this._call("ZTRM_TDEVC_INTERFACE", {
            iv_devclass: devclass.trim().toUpperCase(),
            iv_parentcl: parentcl ? parentcl.trim().toUpperCase() : '',
            iv_rm_parentcl: rmParentCl ? 'X' : ' '
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

    public async addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void>{
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
}