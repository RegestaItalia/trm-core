export class RegistryDeletionTransportUnauthorizedError extends Error {
    public readonly registryEndpoint: string;
    public readonly originalError: unknown;

    constructor(registryEndpoint: string, originalError: unknown) {
        super(`User is not authorized to generate deletion transports in registry "${registryEndpoint}".`);
        this.name = 'RegistryDeletionTransportUnauthorizedError';
        this.registryEndpoint = registryEndpoint;
        this.originalError = originalError;
    }
}
