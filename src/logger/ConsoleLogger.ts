import { MessageType, ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";
import { TreeLog } from "./TreeLog";

export class ConsoleLogger implements ILogger {

    debug: boolean;

    constructor(debug: boolean) { }

    public loading(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.log(text);
    }

    public success(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.log(text);
    }

    public error(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.error(text);
    }

    public warning(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.warn(text);
    }

    public info(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.info(text);
    }

    public log(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.log(text);
    }

    public table(header: any, data: any, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const table = {
            header,
            data
        };
        console.log(JSON.stringify(table));
    }

    public registryResponse(response: ResponseMessage, debug?: boolean) {
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

    public tree(data: TreeLog, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        console.log(JSON.stringify(data));
    }

}