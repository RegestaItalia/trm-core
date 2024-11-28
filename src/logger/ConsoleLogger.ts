import { MessageType, ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";
import { TreeLog } from "./TreeLog";

export class ConsoleLogger implements ILogger {

    debug: boolean;
    
    private _prefix: string = '';

    constructor(debug: boolean) { }

    public loading(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.log(this._prefix + text);
    }

    public success(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.log(this._prefix + text);
    }

    public error(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.error(this._prefix + text);
    }

    public warning(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.warn(this._prefix + text);
    }

    public info(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.info(this._prefix + text);
    }

    public log(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.log(this._prefix + text);
    }

    public table(header: string[], data: string[][], debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        const table = {
            header,
            data
        };
        console.log(this._prefix + JSON.stringify(table));
    }

    public registryResponse(response: ResponseMessage, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        if (response.type === MessageType.ERROR) {
            this.error(response.text, debug);
        }
        if (response.type === MessageType.INFO) {
            this.info(response.text, debug);
        }
        if (response.type === MessageType.WARNING) {
            this.warning(response.text, debug);
        }
    }

    public tree(data: TreeLog, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        console.log(this._prefix + JSON.stringify(data));
    }

    public setPrefix(text: string): void {
        this._prefix = text;
    }

    public removePrefix(): void {
        this._prefix = '';
    }

    public getPrefix(): string {
        return this._prefix;
    }

}