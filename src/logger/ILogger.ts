import { ResponseMessage } from "trm-registry-types";

export interface ILogger {
    loading: (text: string) => void,
    success: (text: string) => void,
    error: (text: string) => void,
    warning: (text: string) => void,
    info: (text: string) => void,
    log: (text: string) => void,
    table: (header: any, data: any) => void,
    registryResponse: (response: ResponseMessage) => void,
    forceStop: () => void
}