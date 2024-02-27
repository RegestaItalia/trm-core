import { ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";

export class DummyLogger implements ILogger {

    debug: boolean;

    constructor() { }

    public loading(text: string, debug?: boolean) { }

    public success(text: string, debug?: boolean) { }

    public error(text: string, debug?: boolean) { }

    public warning(text: string, debug?: boolean) { }

    public info(text: string, debug?: boolean) { }

    public log(text: string, debug?: boolean) { }

    public table(header: any, data: any, debug?: boolean) { }

    public registryResponse(response: ResponseMessage, debug?: boolean) { }

}