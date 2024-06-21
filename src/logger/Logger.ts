import { ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";
import { DummyLogger } from "./DummyLogger";
import { TreeLog } from "./TreeLog";

export namespace Logger {

    export var logger: ILogger = new DummyLogger();
    
    function checkLogger(){
        if(!logger){
            throw new Error('Logger not initialized.');
        }
    }
    
    export function loading(text: string, debug?: boolean): void {
        checkLogger();
        return logger.loading(text, debug);
    }

    export function success(text: string, debug?: boolean): void {
        checkLogger();
        return logger.success(text, debug);
    }

    export function error(text: string, debug?: boolean): void {
        checkLogger();
        return logger.error(text, debug);
    }

    export function warning(text: string, debug?: boolean): void {
        checkLogger();
        return logger.warning(text, debug);
    }

    export function info(text: string, debug?: boolean): void {
        checkLogger();
        return logger.info(text, debug);
    }
    
    export function log(text: string, debug?: boolean): void {
        checkLogger();
        return logger.log(text, debug);
    }

    export function table(header: any, data: any, debug?: boolean): void {
        checkLogger();
        return logger.table(header, data, debug);
    }

    export function registryResponse(response: ResponseMessage, debug?: boolean): void {
        checkLogger();
        return logger.registryResponse(response, debug);
    }

    export function tree(data: TreeLog, debug?: boolean): void {
        checkLogger();
        return logger.tree(data, debug);
    }

}