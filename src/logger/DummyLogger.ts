import { ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";
import { TreeLog } from "./TreeLog";

export class DummyLogger implements ILogger {

    debug: boolean;

    constructor() { }

    public loading(text: string, debug?: boolean): void { }

    public success(text: string, debug?: boolean): void { }

    public error(text: string, debug?: boolean): void { }

    public warning(text: string, debug?: boolean): void { }

    public info(text: string, debug?: boolean): void { }

    public log(text: string, debug?: boolean): void { }

    public table(header: string[], data: string[][], debug?: boolean): void { }

    public registryResponse(response: ResponseMessage, debug?: boolean): void { }

    public tree(data: TreeLog, debug?: boolean): void { }

    public setPrefix(text: string): void { }

    public removePrefix(): void { }

    public getPrefix(): string { 
        return '';
    }

}