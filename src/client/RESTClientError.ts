import { AxiosError } from "axios";
import { SapMessage } from "./SapMessage";
import { ClientError } from "./ClientError";

export class RESTClientError extends ClientError {
    public messageLog?: any;

    constructor(public exceptionType: string, public sapMessage: SapMessage, public restError: AxiosError, message?: string, resource?: string) {
        super(exceptionType, sapMessage, message, resource ?? restError?.config?.url);
        this.name = 'TrmRESTClient';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}