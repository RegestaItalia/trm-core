import { SapMessage } from "./SapMessage";
import { ClientError } from "./ClientError";

export class RFCClientError extends ClientError {

    constructor(public exceptionType: string, public sapMessage: SapMessage, public rfcError: any, message?: string) {
        super(exceptionType, sapMessage, message);
        this.name = 'TrmRFCClient';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}