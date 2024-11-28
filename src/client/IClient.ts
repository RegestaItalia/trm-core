import { SapMessage } from "../systemConnector";

export interface IClient {
    open: () => Promise<void>,
    checkConnection: () => Promise<boolean>,
    getMessage: (data: SapMessage) => Promise<string>
}