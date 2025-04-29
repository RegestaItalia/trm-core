import * as components from "./components";
import * as struct from "./struct";
import { IClient } from "./IClient";
import { getAxiosInstance, normalize } from "../commons";
import { AxiosInstance } from "axios";
import * as FormData from "form-data";
import { ClientError, Login, RESTClientError, SapMessage } from ".";
import { Logger } from "../logger";
import { parse as parseMultipart } from "parse-multipart-data";

const AXIOS_CTX = "RestServer";

export class RESTClient implements IClient {
    private _axiosInstance: AxiosInstance;
    private _connected: boolean = false;

    constructor(public endpoint: string, public rfcdest: components.RFCDEST, private _login: Login, private _cLangu: string) {
        this.endpoint = this.endpoint.trim();
        this._axiosInstance = getAxiosInstance({
            baseURL: this.endpoint,
            auth: {
                username: this._login.user,
                password: this._login.passwd
            },
            timeout: 30000, //default timeout
        }, AXIOS_CTX);
    }

    public async open() {
        if (!this._connected) {
            const response = await this._axiosInstance.get('/', {
                timeout: 5000
            });
            if (response.status !== 200) {
                throw new Error(`Couldn't reach ${this.endpoint}!`);
            } else {
                this._connected = true;
                this._axiosInstance.interceptors.response.use((response) => {
                    return response;
                }, async (error) => {
                    var axiosError;
                    if (error.name === `Trm${AXIOS_CTX}Error`) {
                        axiosError = error.axiosError;
                    } else {
                        axiosError = error;
                    }
                    if (axiosError.config.url === '/read_table') {
                        if (JSON.parse(axiosError.config.data).query_table === 'T100') {
                            throw error;
                        }
                    }
                    var message: string;
                    var messageError;
                    const sapMessage: SapMessage = {
                        no: `${axiosError.response.data.message.msgno}`,
                        class: axiosError.response.data.message.msgid,
                        v1: axiosError.response.data.message.msgv1,
                        v2: axiosError.response.data.message.msgv2,
                        v3: axiosError.response.data.message.msgv3,
                        v4: axiosError.response.data.message.msgv4
                    };
                    try {
                        message = await this.getMessage(sapMessage);
                    } catch (k) {
                        messageError = k;
                        message = `Couldn't read error message ${axiosError.response.data.message.abapMsgClass} ${axiosError.response.data.message.abapMsgNumber} ${axiosError.response.data.message.abapMsgV1} ${axiosError.response.data.message.abapMsgV2} ${axiosError.response.data.message.abapMsgV3} ${axiosError.response.data.message.abapMsgV4}`;
                    }
                    var rfcClientError = new RESTClientError(error.message, sapMessage, axiosError, message);
                    if (messageError) {
                        rfcClientError.messageError = messageError;
                    }
                    if (axiosError.response.data.log) {
                        rfcClientError.messageLog = axiosError.response.data.log;
                    }
                    Logger.error(rfcClientError.toString(), true);
                    throw rfcClientError;
                });
            }
        }
    }

    public async checkConnection(): Promise<boolean> {
        return this._connected;
    }

    public async getMessage(data: SapMessage): Promise<string> {
        var msgnr = data.no;
        while (msgnr.length < 3) {
            msgnr = `0${msgnr}`;
        }
        const aT100: struct.T100[] = await this.readTable('T100',
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

    public async readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]> {
        try {
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
            const result = await this._axiosInstance.get('/read_table', {
                params: {
                    rfcdest: this.rfcdest
                },
                data: {
                    query_table: tableName.toUpperCase(),
                    delimiter,
                    options: aOptions,
                    fields: fields
                }
            });
            const data: struct.TAB512[] = result.data;
            data.forEach(tab512 => {
                var sqlLine: any = {};
                const waSplit = tab512.wa.split(delimiter);
                fields.forEach((field, index) => {
                    sqlLine[field.fieldName] = waSplit[index].trim();
                });
                sqlOutput.push(sqlLine);
            })
            return normalize(sqlOutput);
        } catch (e) {
            if (e.message === 'TABLE_WITHOUT_DATA') {
                return [];
            } else {
                throw e;
            }
        }
    }

    public async getFileSystem(): Promise<struct.FILESYS> {
        const result = (await this._axiosInstance.get('/get_file_sys')).data;
        return result.fileSys;
    }

    public async getDirTrans(): Promise<components.PFEVALUE> {
        const result = (await this._axiosInstance.get('/get_dir_trans')).data;
        return result.dirTrans;
    }

    public async getBinaryFile(filePath: string): Promise<Buffer> {
        const result = (await this._axiosInstance.get('/get_binary_file', {
            responseType: 'arraybuffer',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            data: {
                file_path: filePath
            }
        })).data;
        return result;
    }

    public async writeBinaryFile(filePath: string, binary: Buffer): Promise<void> {
        const formData = new FormData.default();
        var filename: string;
        try {
            filename = /[^\\\/]+$/gmi.exec(filePath)[0];
        } catch (e) {
            filename = 'UNKNOWN_FILENAME';
        }
        formData.append('file', binary, filename);
        formData.append('file_path', filePath,);
        await this._axiosInstance.post('/write_binary_file', formData, {
            headers: formData.getHeaders()
        });
    }

    public async createTocTransport(text: components.AS4TEXT, target: components.TR_TARGET): Promise<components.TRKORR> {
        const result = (await this._axiosInstance.post('/create_toc', {
            text: text,
            target: target.trim().toUpperCase()
        })).data;
        return result.trkorr;
    }

    public async createWbTransport(text: components.AS4TEXT, target?: components.TR_TARGET): Promise<components.TRKORR> {
        const result = (await this._axiosInstance.post('/create_import_tr', {
            text: text,
            target: target.trim().toUpperCase()
        })).data;
        return result.trkorr;
    }

    public async setTransportDoc(trkorr: components.TRKORR, doc: struct.TLINE[]): Promise<void> {
        await this._axiosInstance.put('/set_transport_doc', {
            trkorr: trkorr.trim().toUpperCase(),
            doc: doc
        });
    }

    public async getDevclassObjects(devclass: components.DEVCLASS): Promise<struct.TADIR[]> {
        const result = (await this._axiosInstance.get('/get_devclass_objs', {
            data: {
                devclass: devclass.trim().toUpperCase()
            }
        })).data;
        return result.tadir;
    }

    public async removeComments(trkorr: components.TRKORR, object: components.TROBJTYPE): Promise<void> {
        await this._axiosInstance.delete('/remove_tr_comments', {
            data: {
                trkorr: trkorr.trim().toUpperCase(),
                object: object.trim().toUpperCase()
            }
        });
    }

    public async addToTransportRequest(trkorr: components.TRKORR, content: struct.E071[], lock: boolean): Promise<void> {
        await this._axiosInstance.put('/add_objs_tr', {
            lock: lock ? 'X' : ' ',
            trkorr: trkorr.trim().toUpperCase(),
            e071: content.map(o => {
                return {
                    pgmid: o.pgmid,
                    object: o.object,
                    obj_name: o.objName
                }
            })
        });
    }

    public async repositoryEnvironment(objectType: components.SEU_OBJ, objectName: components.SOBJ_NAME): Promise<struct.SENVI[]> {
        const result = (await this._axiosInstance.get('/repository_environment', {
            params: {
                rfcdest: this.rfcdest
            },
            data: {
                obj_type: objectType.trim().toUpperCase(),
                object_name: objectName.trim().toUpperCase()
            }
        })).data;
        return result.environmentTab;
    }

    public async deleteTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._axiosInstance.delete('/delete_transport', {
            data: {
                trkorr: trkorr.trim().toUpperCase()
            }
        });
    }

    public async releaseTrkorr(trkorr: components.TRKORR, lock: boolean, timeout?: number): Promise<void> {
        await this._axiosInstance.post('/release_tr', {
            trkorr: trkorr.trim().toUpperCase(),
            lock: lock ? 'X' : ' '
        }, {
            timeout: timeout * 1000
        });
    }

    public async addSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._axiosInstance.put('/add_skip_trkorr', {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async removeSkipTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._axiosInstance.delete('/remove_skip_trkorr', {
            data: {
                trkorr: trkorr.trim().toUpperCase()
            }
        });
    }

    public async addSrcTrkorr(trkorr: components.TRKORR): Promise<void> {
        await this._axiosInstance.put('/add_src_trkorr', {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async readTmsQueue(target: components.TMSSYSNAM): Promise<struct.STMSIQREQ[]> {
        const result = (await this._axiosInstance.get('/read_tms_queue', {
            data: {
                target: target
            }
        })).data;
        return result.requests;
    }

    public async createPackage(scompkdtln: struct.SCOMPKDTLN): Promise<void> {
        await this._axiosInstance.post('/create_package', scompkdtln);
    }

    public async tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean, devlayer?: components.DEVLAYER): Promise<void> {
        await this._axiosInstance.post('/tdevc_interface', {
            devclass: devclass.trim().toUpperCase(),
            parentcl: parentcl ? parentcl.trim().toUpperCase() : '',
            rm_parentcl: rmParentCl ? 'X' : ' ',
            devlayer: devlayer ? devlayer.trim().toUpperCase() : ''
        });
    }

    public async getDefaultTransportLayer(): Promise<components.DEVLAYER> {
        const result = (await this._axiosInstance.get('/get_transport_layer')).data;
        return result.layer;
    }

    public async tadirInterface(tadir: struct.TADIR): Promise<void> {
        await this._axiosInstance.post('/tadir_interface', {
            pgmid: tadir.pgmid,
            object: tadir.object,
            obj_name: tadir.objName,
            devclass: tadir.devclass,
            set_genflag: tadir.genflag ? 'X' : ' ',
            srcsystem: tadir.srcsystem
        });
    }

    public async dequeueTransport(trkorr: components.TRKORR): Promise<void> {
        await this._axiosInstance.post('/dequeue_tr', {
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async forwardTransport(trkorr: components.TRKORR, target: components.TMSSYSNAM, source: components.TMSSYSNAM, importAgain: boolean = true): Promise<void> {
        await this._axiosInstance.post('/forward_tr', {
            trkorr: trkorr.trim().toUpperCase(),
            target: target.trim().toUpperCase(),
            source: source.trim().toUpperCase(),
            import_again: importAgain ? 'X' : ' '
        });
    }

    public async importTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        await this._axiosInstance.post('/import_tr', {
            system: system.trim().toUpperCase(),
            trkorr: trkorr.trim().toUpperCase()
        });
    }

    public async setInstallDevc(installDevc: struct.ZTRM_INSTALLDEVC[]): Promise<void> {
        await this._axiosInstance.put('/set_install_devc', {
            installdevc: installDevc
        });
    }

    public async getObjectsList(): Promise<struct.KO100[]> {
        const result = (await this._axiosInstance.get('/list_object_types')).data;
        return result.objectText;
    }

    public async getTrmServerVersion(): Promise<string> {
        const result = (await this._axiosInstance.get('/version')).data;
        return result.serverVersion;
    }

    public async getTrmRestVersion(): Promise<string> {
        const result = (await this._axiosInstance.get('/version')).data;
        return result.restVersion;
    }

    public async trmServerPing(): Promise<string> {
        const result = (await this._axiosInstance.get('/ping')).data;
        return result.return;
    }

    public async renameTransportRequest(trkorr: components.TRKORR, as4text: components.AS4TEXT): Promise<void> {
        await this._axiosInstance.post('/rename_transport_request', {
            trkorr: trkorr.trim().toUpperCase(),
            as4text: as4text
        });
    }

    public async setPackageIntegrity(integrity: struct.ZTRM_INTEGRITY): Promise<void> {
        await this._axiosInstance.put('/set_integrity', {
            integrity: integrity
        });
    }

    public async addTranslationToTr(trkorr: components.TRKORR, devclassFilter: struct.LXE_TT_PACKG_LINE[]): Promise<void> {
        await this._axiosInstance.put('/add_lang_tr', {
            trkorr: trkorr,
            devclass: devclassFilter
        });
    }

    public async trCopy(from: components.TRKORR, to: components.TRKORR, doc: boolean = false): Promise<void> {
        await this._axiosInstance.post('/tr_copy', {
            from: from,
            to: to,
            doc: doc ? 'X' : ' '
        });
    }

    public async getDest(): Promise<string> {
        const result = (await this._axiosInstance.get('/get_dest', {
            params: {
                rfcdest: this.rfcdest
            }
        })).data;
        return result.dest;
    }

    public async getTransportObjectsBulk(trkorr: components.TRKORR): Promise<struct.TADIR[]> {
        const result = (await this._axiosInstance.get('/get_transport_objs_bulk', {
            data: {
                trkorr
            }
        })).data;
        return result.tadir;
    }

    public async getExistingObjectsBulk(objects: struct.TADIR[]): Promise<struct.TADIR[]> {
        const result = (await this._axiosInstance.get('/get_existing_objs_bulk', {
            data: {
                objects
            }
        })).data;
        return result.tadir;
    }

    public async addNamespace(namespace: components.NAMESPACE, replicense: components.TRNLICENSE, texts: struct.TRNSPACETT[]): Promise<void> {
        await this._axiosInstance.put('/add_namespace', {
            namespace,
            replicense,
            texts
        });
    }

    public async getR3transInfo(): Promise<string> {
        const result = (await this._axiosInstance.get('/get_r3trans_info')).data;
        return result.log;
    }

    public async migrateTransport(trkorr: components.TRKORR): Promise<components.ZTRM_TRKORR> {
        const result = (await this._axiosInstance.post('/migrate_transport', {
            trkorr
        })).data;
        return result.trmTrkorr;
    }

    public async deleteTmsTransport(trkorr: components.TRKORR, system: components.TMSSYSNAM): Promise<void> {
        await this._axiosInstance.delete('/delete_transport', {
            data: {
                trkorr,
                system
            }
        });
    }

    public async refreshTransportTmsTxt(trkorr: components.TRKORR): Promise<void> {
        await this._axiosInstance.post('/refresh_tms_transport_txt', {
            trkorr
        });
    }

    public async getDotAbapgit(devclass: components.DEVCLASS): Promise<Buffer> {
        const result = (await this._axiosInstance.get('/get_dot_abapgit', {
            responseType: 'arraybuffer',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            data: {
                devclass
            }
        })).data;
        return result;
    }

    public async getAbapgitSource(devclass: components.DEVCLASS): Promise<{ zip: Buffer, objects: struct.TADIR[] }> {
        const { headers, data } = await this._axiosInstance.get('/get_abapgit_source', {
            responseType: 'arraybuffer',
            headers: {
                'Content-Type': 'multipart/mixed'
            },
            data: {
                devclass
            }
        });
        try {
            const boundary = headers['content-type'].match(/boundary=([-0-9A-Za-z]+)/i)[1];
            const parsedData = parseMultipart(data, boundary);
            return {
                zip: parsedData.find(o => o.name === 'zip').data,
                objects: JSON.parse(parsedData.find(o => o.name === 'objects').data.toString())
            }
        } catch (e) {
            throw new Error(`Can't parse api data.`);
        }
    }

    public async executePostActivity(data: Buffer): Promise<struct.SYMSG[]> {
        const result = (await this._axiosInstance.post('/execute_post_activity', data, {
            timeout: 60000
        })).data;
        return result.messages;
    }

}