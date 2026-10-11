import { RegistryDeletionTransportUnavailableError } from "./RegistryDeletionTransportUnavailableError";

export class RegistryDeletionTransportUnauthorizedError extends RegistryDeletionTransportUnavailableError {
    constructor(registryEndpoint: string, originalError: unknown) {
        super(registryEndpoint, `User is not authorized to generate deletion transports in registry "${registryEndpoint}".`, originalError);
        this.name = 'RegistryDeletionTransportUnauthorizedError';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}
