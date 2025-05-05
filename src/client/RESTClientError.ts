import { AxiosError } from "axios";
import { SapMessage } from "./SapMessage";
import { ClientError } from "./ClientError";

export class RESTClientError extends ClientError {
    public messageLog?: any;

    constructor(public exceptionType: string, public sapMessage: SapMessage, public restError: AxiosError, message?: string) {
        super(exceptionType, sapMessage, message);
        this.name = 'TrmRESTClient';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}