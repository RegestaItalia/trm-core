/** Registry navigation features that a registry may not implement. */
export type RegistryFeature = 'search' | 'info' | 'readme' | 'manifest' | 'namespace' | (string & {});

/**
 * The registry does not implement an optional feature (e.g. package search or navigation):
 * it answered 501/405, or the route doesn't exist (404 without a registry error message).
 */
export class RegistryFeatureUnsupportedError extends Error {
    public readonly feature: RegistryFeature;
    public readonly registryEndpoint: string;
    public readonly status?: number;
    public readonly originalError?: unknown;

    constructor(feature: RegistryFeature, registryEndpoint?: string, status?: number, originalError?: unknown) {
        super(registryEndpoint
            ? `Registry "${registryEndpoint}" doesn't support ${feature}.`
            : `Registry doesn't support ${feature}.`);
        this.name = 'RegistryFeatureUnsupportedError';
        this.feature = feature;
        this.registryEndpoint = registryEndpoint;
        this.status = status;
        this.originalError = originalError;

        Object.setPrototypeOf(this, new.target.prototype);
    }
}
