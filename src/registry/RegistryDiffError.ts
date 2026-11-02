/** Error code of a registry feature that needs an active Pro plan (HTTP 402 Payment Required). */
export const PRO_PLAN_REQUIRED = 'PRO_PLAN_REQUIRED';

/**
 * The registry can't provide a release diff. `status` and `code` are the registry's
 * (e.g. 401, 402 `PRO_PLAN_REQUIRED`, 404, 409 `diff_unavailable`, 422 `diff_failed` /
 * `diff_too_large`, 501 when the registry has no diffs); the message is the registry's own.
 */
export class RegistryDiffError extends Error {
    public readonly registryEndpoint: string;
    public readonly status?: number;
    public readonly code?: string;
    public readonly originalError?: unknown;

    constructor(registryEndpoint: string, message: string, status?: number, code?: string, originalError?: unknown) {
        super(message);
        this.name = 'RegistryDiffError';
        this.registryEndpoint = registryEndpoint;
        this.status = status;
        this.code = code;
        this.originalError = originalError;

        Object.setPrototypeOf(this, new.target.prototype);
    }

    /** The account needs an active Pro plan to compare releases on this registry. */
    public get proPlanRequired(): boolean {
        return this.status === 402 || this.code === PRO_PLAN_REQUIRED;
    }

    /** The registry does not implement release diffs. */
    public get notSupported(): boolean {
        return this.status === 501;
    }
}
