import { ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";

export namespace Logger {

    export var logger: ILogger;
    
    function checkLogger(){
        if(!logger){
            throw new Error('Logger not initialized.');
        }
    }
    
    export function loading(text: string, debug?: boolean): void {
        checkLogger();
        logger.loading(text, debug);
    }

    export function success(text: string, debug?: boolean) {
        checkLogger();
        logger.success(text, debug);
    }

    export function error(text: string, debug?: boolean) {
        checkLogger();
        logger.error(text, debug);
    }

    export function warning(text: string, debug?: boolean) {
        checkLogger();
        logger.warning(text, debug);
    }

    export function info(text: string, debug?: boolean) {
        checkLogger();
        logger.info(text, debug);
    }
    
    export function log(text: string, debug?: boolean) {
        checkLogger();
        logger.log(text, debug);
    }

    export function table(header: any, data: any, debug?: boolean) {
        checkLogger();
        logger.table(header, data, debug);
    }

    export function registryResponse(response: ResponseMessage, debug?: boolean) {
        checkLogger();
        logger.registryResponse(response, debug);
    }

}