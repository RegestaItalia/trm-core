/**
 * The registry can't generate a deletion transport (request failed, or local .trm files).
 * The message is the registry's own. Cleanups that only tidy up log it and continue without it.
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
