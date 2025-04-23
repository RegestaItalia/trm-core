import { ResponseMessage } from "trm-registry-types";
import { TreeLog } from "./TreeLog";

export interface ILogger {
    debug: boolean,
    setPrefix: (text: string) => void,
    removePrefix: () => void,
    getPrefix: () => string,
    loading: (text: string, debug?: boolean) => void,
    success: (text: string, debug?: boolean) => void,
    error: (text: string, debug?: boolean) => void,
    warning: (text: string, debug?: boolean) => void,
    info: (text: string, debug?: boolean) => void,
    log: (text: string, debug?: boolean) => void,
    table: (header: string[], data: string[][], debug?: boolean) => void,
    registryResponse: (response: ResponseMessage, debug?: boolean) => void,
    tree: (data: TreeLog, debug?: boolean) => void,
    msgty: (msgty: string, text: string, debug?: boolean) => void
}