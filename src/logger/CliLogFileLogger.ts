import { ResponseMessage } from "trm-registry-types";
import { CliLogger } from "./CliLogger";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { v4 as uuidv4 } from 'uuid';
import { join } from "path";
import { getStackTrace } from "get-stack-trace";
import { TreeLog } from "./TreeLog";

export class CliLogFileLogger extends CliLogger {

    private _filePath: string;
    private _sessionId: string;

    constructor(private _dir: string, debug?: boolean) {
        super(debug);
        if(!existsSync(this._dir)){
            mkdirSync(this._dir, {
                recursive: true
            });
        }
        this._sessionId = uuidv4();
        this._filePath = join(this._dir, `${this._sessionId}.txt`);
        writeFileSync(this.getFilePath(), `*** STARTING LOG SESSION ID ${this._sessionId}, ${new Date().toISOString()} ***`);
    }

    public getSessionId(): string {
        return this._sessionId;
    }

    private _getStackTrace(): string {
        var sStackTrace: string;
        try{
            const aStackTrace = getStackTrace();
            const oStackTrace = aStackTrace[5];

            //extract trm-module
            const moduleName = /(trm-[^\\\/]*)(?:\\{1,2}|\/{1,2})dist/gmi.exec(oStackTrace.fileName)[1];
            sStackTrace = `[${moduleName}] ${oStackTrace.functionName} ${oStackTrace.lineNumber},${oStackTrace.columnNumber}`;
        }catch(e){
            sStackTrace = ``;
        }
        return sStackTrace;
    }

    private _getDebugString(text: string, type: string) {
        const sStackTrace = this._getStackTrace();
        return `${type} ${new Date().toISOString()} ${sStackTrace}   ${text}`;
    }

    private _append(text: string, type: string) {
        appendFileSync(this.getFilePath(), `\n${this._getDebugString(text, type)}`);
    }

    public endLog(){
        appendFileSync(this.getFilePath(), `\n*** ENDING LOG SESSION ID ${this._sessionId}, ${new Date().toISOString()} ***`);
    }

    public getFilePath(): string {
        return this._filePath;
    }

    public loading(text: string, debug?: boolean) {
        this._append(text, 'WAIT');
        super.loading(text, debug);
    }

    public success(text: string, debug?: boolean) {
        this._append(text, 'OK  ');
        super.success(text, debug);
    }

    public error(text: string, debug?: boolean) {
        this._append(text, 'ERR ');
        super.error(text, debug);
    }

    public warning(text: string, debug?: boolean) {
        this._append(text, 'WARN');
        super.warning(text, debug);
    }

    public info(text: string, debug?: boolean) {
        this._append(text, 'INFO');
        super.info(text, debug);
    }

    public log(text: string, debug?: boolean) {
        this._append(text, 'LOG ');
        super.log(text, debug);
    }

    public table(header: any, data: any, debug?: boolean) {
        this._append(`${JSON.stringify(header)}${JSON.stringify(data)}`, 'TABL');
        super.table(header, data, debug);
    }

    public registryResponse(response: ResponseMessage, debug?: boolean) {
        this._append(`${JSON.stringify(response)}`, 'REG ');
        super.registryResponse(response, debug);
    }

    public tree(data: TreeLog, debug?: boolean) {
        this._append(`${JSON.stringify(data)}`, 'TREE');
        super.tree(data, debug);
    }

    public forceStop(): void {
        this.log(`Forcing loader stop.`, true);
        super.forceStop();
    }

}