import { SapMessage } from "./SapMessage";

export class ClientError extends Error {
    public messageError?: string;

    constructor(public exceptionType: string, public sapMessage: SapMessage, message?: string) {
        super(message);
        this.name = 'ClientError';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}