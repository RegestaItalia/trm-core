export class RegistryPackageNotFoundError extends Error {
    public readonly packageName: string;
    public readonly requestedVersion: string;
    public readonly registryEndpoint: string;
    public readonly originalError: unknown;

    constructor(packageName: string, requestedVersion: string, registryEndpoint: string, originalError: unknown) {
        super(`Package "${packageName}" version "${requestedVersion}" was not found in registry "${registryEndpoint}".`);
        this.name = 'RegistryPackageNotFoundError';
        this.packageName = packageName;
        this.requestedVersion = requestedVersion;
        this.registryEndpoint = registryEndpoint;
        this.originalError = originalError;
    }
}
