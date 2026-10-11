/**
 * The registry can't generate a deletion transport: the user isn't authorized (e.g. registry plan)
 * or the registry doesn't support it (local .trm files). Cleanups that only tidy up continue without it.
 */
export class RegistryDeletionTransportUnavailableError extends Error {
    public readonly registryEndpoint: string;
    public readonly originalError: unknown;

    constructor(registryEndpoint: string, message: string, originalError?: unknown) {
        super(message);
        this.name = 'RegistryDeletionTransportUnavailableError';
        this.registryEndpoint = registryEndpoint;
        this.originalError = originalError;

        Object.setPrototypeOf(this, new.target.prototype);
    }
}
