import * as components from "./components";
import * as struct from "./struct";
import { IClient } from "./IClient";
import { normalize } from "../commons";
import { getGlobalNodeModules, Logger } from "trm-commons";
import { existsSync } from "fs";
import path from "path";
import { RFCClientError, SapMessage } from ".";
import * as xml from "xml-js";

const nodeRfcLib = 'node-rfc';

export class RFCClient implements IClient {
    protected _rfcClient: any;
    private _aliveCheck: boolean = false;

    constructor(private _rfcClientArgs: any, private _cLangu: string, traceDir?: string, private _globalNodeModulesPath?: string) {
        try {
            process.env["RFC_TRACE_DIR"] = traceDir || process.cwd();
        } catch (e) {
            //not sure if this could cause an error!
            Logger.warning(`Couldn't set RFC trace!`, true);
            Logger.error(e.toString(), true);
        }
        Logger.log(`RFC_TRACE_DIR: ${process.env["RFC_TRACE_DIR"]}`, true);
    }

    private async getRfcClient(): Promise<any> {
        if (!this._rfcClient) {
            const libPath = path.join(this._globalNodeModulesPath || getGlobalNodeModules(), nodeRfcLib);
            Logger.log(`Node RFC lib path: ${libPath}`, true);
            if (!existsSync(libPath)) {
                throw new RFCClientError("ZRFC_LIB_NOT_FOUND", null, null, `${nodeRfcLib} not found. Run command "npm install ${nodeRfcLib} -g" to continue.`);
            }
            this._rfcClient = new (await import(libPath)).Client(this._rfcClientArgs);
        }
        return this._rfcClient;
    }

    public async open() {
        try {
            Logger.loading(`Opening RFC connection`, true);
            await (await this.getRfcClient()).open();
            Logger.success(`RFC open`, true);
        } catch (e) {
            throw new RFCClientError("ZNO_CONN", null, e, e.message);
        }
    }

    public async close() {
        try {
            Logger.loading(`Closing RFC connection`, true);
            await (await this.getRfcClient()).close();
            Logger.success(`RFC closed`, true);
        } catch (e) {
            throw new RFCClientError("ZNO_CLOSE", null, e, e.message);
        }
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

    private sanitizeDebugResponse(obj) {
        if (Buffer.isBuffer(obj)) {
            try {
                return `<file of ${obj.byteLength} bytes>`;
            } catch {
                return "<file of unknown bytes>";
            }
        }

        if (Array.isArray(obj)) {
            return obj.map(v => this.sanitizeDebugResponse(v));
        }

        if (obj && typeof obj === "object") {
            return Object.fromEntries(
                Object.entries(obj).map(([k, v]) => [k, this.sanitizeDebugResponse(v)])
            );
        }

        return obj;
    }

    private async _call(fm: any, arg?: any, timeout?: number, noErrorParsing?: boolean, retryCount: number = 0): Promise<any> {
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
            Logger.success(`RFC resonse: ${JSON.stringify(this.sanitizeDebugResponse(responseNormalized))}`, true);
            return responseNormalized;
        } catch (e) {
            if (e.message === 'device or resource busy: device or resource busy' && retryCount <= 10) {
                //node-rfc #327 this issue is not yet solved
                //for the time being try recalling
                Logger.log('device or resource busy, retrying', true);
                await new Promise(res => {
                    setTimeout(res, 1000);
                });
                return this._call(fm, arg, timeout, noErrorParsing, retryCount + 1);
            }
            if (noErrorParsing) {
                throw e;
            } else {
                var message: string;
                var messageError;
                const sapMessage: SapMessage = {
                    no: `${e.abapMsgNumber}`,
                    class: e.abapMsgClass,
                    v1: e.abapMsgV1,
                    v2: e.abapMsgV2,
                    v3: e.abapMsgV3,
                    v4: e.abapMsgV4
                };
                if (sapMessage.no && sapMessage.class) {
                    try {
                        message = await this._getMessage(true, sapMessage);
                    } catch (k) {
                        messageError = k;
                        message = `Couldn't read error message ${e.abapMsgClass} ${e.abapMsgNumber} ${e.abapMsgV1} ${e.abapMsgV2} ${e.abapMsgV3} ${e.abapMsgV4}`;
                    }
                } else {
                    message = e.message;
                }
                var rfcClientError = new RFCClientError(e.key, sapMessage, e, message);
                if (messageError) {
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
            var counter = 1;
            do {
                if (msg.includes(`&${counter}`)) {
                    msg = msg.replace(new RegExp(`&${counter}`, 'gmi'), data[`v${counter}`] || '');
                    msg = msg.replace(new RegExp(`&${counter}&`, 'gmi'), data[`v${counter}`] || '');
                } else {
                    msg = msg.replace("&", data[`v${counter}`] || '');
                }
                counter++;
            } while (counter <= 4);
            msg = msg.replace(new RegExp(`&\\d*`, 'gmi'), '');
            msg = msg.replace(new RegExp(`&`, 'gmi'), '');
            return msg.trim();
        } else {
            throw new RFCClientError("ZMSG_NOT_FOUND", null, null, `Message ${msgnr}, class ${data.class}, lang ${this._cLangu} not found.`);
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
        try {
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
        } catch (e) {
            if (e.exceptionType === 'TABLE_WITHOUT_DATA') {
                return [];
            } else {
                throw e;
            }
        }
    }

    public async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        return this._readTable(false, tableName, fields, options);
    }

    public async getFileSystem(): Promise<struct.FILESYS> {
        const result = await this._call("/ATRM/GET_FILE_SYS", {});
        return result['fileSys'];
    }

    public async getDirTrans(): Promise<components.PFEVALUE> {
        const result = await this._call("/ATRM/GET_DIR_TRANS", {});
        return result['dirTrans'];
    }

    public async getBinaryFile(filePath: string): Promise<Buffer> {
        const result = await this._call("/ATRM/GET_BINARY_FILE", {
            file_path: filePath
        });
        return result['file'];
    }

    public async writeBinaryFile(filePath: string, binary: Buffer): Promise<void> {
        await this._call("/ATRM/WRITE_BINARY_FILE", {
            file_path: filePath,
            file: binary
        });
    }

    public async createTocTransport(text: components.AS4TEXT, target: components.TR_TARGET): Promise<components.TRKORR> {
        const result = await this._call("/ATRM/CREATE_TOC", {
            text: text,
            target: target.trim().toUpperCase()
        });
        return result['trkorr'];
    }

    public async createWbTransport(text: components.AS4TEXT, target?: components.TR_TARGET): Promise<components.TRKORR> {
        const result = await this._call("/ATRM/CREATE_IMPORT_TR", {
            text: text,
            target: target.trim().toUpperCase()
        });
        return result['trkorr'];
    }

    public async setTransportDoc(trkorr: components.TRKORR, doc: struct.TLINE[]): Promise<void> {
        await this._call("/ATRM/SET_TRANSPORT_DOC", {
            trkorr: trkorr.trim().toUpperCase(),
            doc: doc
        });
    }

    public async getDevclassObjects(devclass: components.DEVCLASS): Promise<struct.TADIR[]> {
        const result = await this._call("/ATRM/GET_DEVCLASS_OBJS", {
            devclass: devclass.trim().toUpperCase()
        });
        return result['tadir'];
    }

    public async removeComments(trkorr: components.TRKORR, object: components.TROBJTYPE): Promise<void> {
        await this._call("/ATRM/REMOVE_TR_COMMENTS", {
            trkorr: trkorr.trim().toUpperCase(),
            object: object.trim().toUpperCase()
        });
    }

    public async addToTransportRequest(trkorr: components.TRKORR, content: struct.E071[], lock: boolean): Promise<void> {
        await this._call("/ATRM/ADD_OBJS_TR", {
            lock: lock ? 'X' : ' ',
            trkorr: trkorr.trim().toUpperCase(),
            e071: content.map(o => {
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
        await this._call("/ATRM/DELETE_TRANSPORT", {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async releaseTrkorr(trkorr: components.TRKORR, lock: boolean, timeout?: number): Promise<void> {
        await this._call("/ATRM/RELEASE_TR", {
            trkorr: trkorr.trim().toUpperCase(),
            lock: lock ? 'X' : ' '
        }, timeout);
    }

    public async addSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._call("/ATRM/ADD_SKIP_TRKORR", {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async removeSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._call("/ATRM/REMOVE_SKIP_TRKORR", {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async addSrcTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._call("/ATRM/ADD_SRC_TRKORR", {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async readTmsQueue(target: components.TMSSYSNAM): Promise<struct.STMSIQREQ[]> {
        const result = await this._call("/ATRM/READ_TMS_QUEUE", {
            target: target
        });
        return result['requests'];
    }

    public async createPackage(scompkdtln: struct.SCOMPKDTLN): Promise<void> {
        await this._call("/ATRM/CREATE_PACKAGE", {
            data: scompkdtln
        });
    }

    public async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean, devlayer?: components.DEVLAYER): Promise<void> {
        await this._call("/ATRM/TDEVC_INTERFACE", {
            devclass: devclass.trim().toUpperCase(),
            parentcl: parentcl ? parentcl.trim().toUpperCase() : '',
            rm_parentcl: rmParentCl ? 'X' : ' ',
            devlayer: devlayer ? devlayer.trim().toUpperCase() : ''
        });
    }

    public async getDefaultTransportLayer(): Promise<components.DEVLAYER> {
        const result = await this._call("/ATRM/GET_TRANSPORT_LAYER");
        return result['layer'];
    }

    public async tadirInterface(tadir: struct.TADIR): Promise<void> {
        await this._call("/ATRM/TADIR_INTERFACE", {
            pgmid: tadir.pgmid,
            object: tadir.object,
            obj_name: tadir.objName,
            devclass: tadir.devclass,
            set_genflag: tadir.genflag ? 'X' : ' ',
            srcsystem: tadir.srcsystem
        });
    }

    public async dequeueTransport(trkorr: components.TRKORR): Promise<void> {
        await this._call("/ATRM/DEQUEUE_TR", {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async forwardTransport(trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean = true): Promise<void> {
        await this._call("/ATRM/FORWARD_TR", {
            trkorr: trkorr.trim().toUpperCase(),
            target: target.trim().toUpperCase(),
            source: source.trim().toUpperCase(),
            import_again: importAgain ? 'X' : ' '
        });
    }

    public async importTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        await this._call("/ATRM/IMPORT_TR", {
            system: system.trim().toUpperCase(),
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async setInstallDevc(installDevc: struct.ZTRM_INSTALLDEVC[]): Promise<void> {
        await this._call("/ATRM/SET_INSTALL_DEVC", {
            installdevc: installDevc
        });
    }

    public async getObjectsList(): Promise<struct.KO100[]> {
        const result = await this._call("/ATRM/LIST_OBJECT_TYPES");
        return result['objectText'];
    }

    public async getTrmServerVersion(): Promise<string> {
        const result = await this._call("/ATRM/VERSION");
        return result['version'];
    }

    public async getTrmRestVersion(): Promise<string> {
        const result = await this._call("/ATRM/VERSION");
        return result['rest'];
    }

    public async trmServerPing(): Promise<string> {
        const result = await this._call("/ATRM/PING");
        return result['return'];
    }

    public async renameTransportRequest(trkorr: components.TRKORR, as4text: components.AS4TEXT): Promise<void> {
        await this._call("/ATRM/RENAME_TRANSPORT_REQUEST", {
            trkorr: trkorr.trim().toUpperCase(),
            as4text: as4text
        });
    }

    public async setPackageIntegrity(integrity: struct.ZTRM_INTEGRITY): Promise<void> {
        await this._call("/ATRM/SET_INTEGRITY", {
            integrity: integrity
        });
    }

    public async addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void> {
        await this._call("/ATRM/ADD_LANG_TR", {
            trkorr: trkorr,
            devclass: devclassFilter
        });
    }

    public async trCopy(from: components.TRKORR, to: components.TRKORR, doc: boolean = false): Promise<void> {
        await this._call("/ATRM/TR_COPY", {
            from: from,
            to: to,
            doc: doc ? 'X' : ' '
        });
    }

    public async addNamespace(namespace: components.NAMESPACE, replicense: components.TRNLICENSE, texts: struct.TRNSPACETT[]): Promise<void> {
        await this._call("/ATRM/ADD_NAMESPACE", {
            namespace: namespace,
            replicense: replicense,
            texts: texts
        });
    }

    public async getR3transInfo(): Promise<string> {
        const result = await this._call("/ATRM/GET_R3TRANS_INFO");
        return result['log'];
    }

    public async migrateTransport(trkorr: components.TRKORR): Promise<components.ZTRM_TRKORR> {
        const result = await this._call("/ATRM/MIGRATE_TRANSPORT", {
            trkorr: trkorr
        });
        return result['trmTrkorr'];
    }

    public async deleteTmsTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        await this._call("/ATRM/DEL_TRANSPORT_TMS", {
            trkorr: trkorr,
            system: system
        });
    }

    public async refreshTransportTmsTxt(trkorr: components.TRKORR): Promise<void> {
        await this._call("/ATRM/REFRESH_TR_TMS_TXT", {
            trkorr: trkorr
        });
    }

    public async getDotAbapgit(devclass: components.DEVCLASS): Promise<Buffer> {
        const result = await this._call("/ATRM/GET_DOT_ABAPGIT", {
            devclass: devclass
        });
        return result['dotAbapgit'];
    }

    public async getAbapgitSource(devclass: components.DEVCLASS): Promise<{ zip: Buffer, objects: struct.ZTY_SER_OBJ[] }> {
        const result = await this._call("/ATRM/GET_ABAPGIT_SOURCE", {
            devclass: devclass
        });
        const sXml = result['objects'].toString().replace(/&/g, "&amp;").replace(/-/g, "&#45;");
        const oAbapXml = xml.xml2js(sXml, { compact: true });
        const objects = oAbapXml['asx:abap']['asx:values']['OBJECTS'].item.map(o => {
            return {
                pgmid: o['PGMID']['_text'],
                object: o['OBJECT']['_text'],
                objName: o['OBJ_NAME']['_text'],
                fullPath: o['FULL_PATH']['_text']
            };
        });
        return {
            zip: result['zip'],
            objects
        }
    }

    public async executePostActivity(data: Buffer, pre?: boolean): Promise<{ messages: struct.SYMSG[], execute?: boolean }> {
        const result = await this._call("/ATRM/EXECUTE_POST_ACTIVITY", {
            data: data,
            pre: pre ? 'X' : ''
        });
        return {
            messages: result['messages'],
            execute: result['execute'] === 'X'
        };
    }

    public async getInstalledPackagesBackend(): Promise<struct.ZTY_TRM_PACKAGE[]> {
        const result = await this._call("/ATRM/GET_INSTALLED_PACKAGES");
        const sXml = result['packages'].toString().replace(/&/g, "&amp;").replace(/-/g, "&#45;");
        const oAbapXml = xml.xml2js(sXml, { compact: true });
        return oAbapXml['asx:abap']['asx:values']['PACKAGES'].item.map(o => {
            var flatTdevc = [];
            if (o['TDEVC'] && o['TDEVC']['TDEVC']) {
                if (!Array.isArray(o['TDEVC']['TDEVC'])) {
                    o['TDEVC']['TDEVC'] = [o['TDEVC']['TDEVC']];
                }
                flatTdevc = o['TDEVC']['TDEVC'].map((item) => {
                    const flattened: Record<string, string> = {};
                    for (const [key, value] of Object.entries(item)) {
                        if (typeof value === 'object' && value !== null && '_text' in value) {
                            flattened[key] = (value as any)._text;
                        }
                    }
                    return flattened;
                });
            }
            return {
                name: o['NAME']['_text'],
                version: o['VERSION']['_text'],
                registry: o['REGISTRY']['_text'],
                manifest: o['XMANIFEST']['_text'] ? Buffer.from(o['XMANIFEST']['_text'], 'base64').toString('utf8') : undefined,
                transport: {
                    trkorr: o['TRANSPORT']['TRKORR']['_text'],
                    migration: o['TRANSPORT']['MIGRATION']['_text'] === 'X',
                },
                tdevc: normalize(flatTdevc),
                trkorr: o['TRKORR']['_text']
            };
        });
    }

    public async isServerApisAllowed(): Promise<true | RFCClientError> {
        try {
            await this._call("/ATRM/CHECK_AUTH");
            return true;
        } catch (e) {
            return e;
        }
    }


    public async changeTrOwner(trkorr: components.TRKORR, owner: components.TR_AS4USER): Promise<void> {
        await this._call("/ATRM/CHANGE_TR_OWNER", {
            trkorr: trkorr,
            new_owner: owner
        });
    }

    public async getPackageDependencies(devclass: components.DEVCLASS, includeSubPackages: boolean, logId?: components.ZTRM_POLLING_ID): Promise<struct.ZTRM_OBJECT_DEPENDENCIES[]> {
        const result = await this._call("/ATRM/GET_DEPENDENCIES", {
            devclass: devclass,
            incl_sub: includeSubPackages ? 'X' : ' ',
            log_id: logId
        });
        return result['dependencies'];
    }

    public async getObjectDependenciesInternal(object: components.TROBJTYPE, objName: components.SOBJ_NAME): Promise<struct.ZTRM_OBJECT_DEPENDENCY[]> {
        const result = await this._call("/ATRM/GET_DEPENDENCIES_SINGLE", {
            object: {
                object,
                obj_name: objName
            }
        });
        return result['dependencies'];
    }

    public async createLogPolling(event: components.ZTRM_POLLING_EVENT): Promise<components.ZTRM_POLLING_ID> {
        const result = await this._call("/ATRM/CREATE_LOG_POLLING", {
            event: event
        });
        return result['id'];
    }

    public async deleteLogPolling(logID: components.ZTRM_POLLING_ID): Promise<void> {
        await this._call("/ATRM/DELETE_LOG_POLLING", {
            id: logID
        });
    }

    public async readLogPolling(logID: components.ZTRM_POLLING_ID): Promise<components.ZTRM_POLLING_LAST_MSG> {
        const result = await this._call("/ATRM/READ_LOG_POLLING", {
            id: logID
        });
        return result['log'];
    }

    public async getTransportImportStatus(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<struct.TPSTAT> {
        const result = await this._call("/ATRM/GET_TR_IMPORT_STATUS", {
            trkorr: trkorr,
            system: system
        });
        return result['status'];
    }

    public async getPackageObjLocks(devclass: components.DEVCLASS): Promise<struct.ZTRM_OBJ_LOCK[]> {
        const result = await this._call("/ATRM/GET_PACKAGE_OBJ_LOCKS", {
            devclass
        });
        return result['locks'];
    }

}