/**
 * The registry can't generate a deletion transport (request failed, or local .trm files).
 * The message is the registry's own. Cleanups that only tidy up log it and continue without it.
 * `status` and `code` carry the registry's HTTP status and error code, when it answered.
 */
export class RegistryDeletionTransportUnavailableError extends Error {
    public readonly registryEndpoint: string;
    public readonly originalError: unknown;
    public readonly status?: number;
    public readonly code?: string;

    constructor(registryEndpoint: string, message: string, originalError?: unknown) {
        super(message);
        this.name = 'RegistryDeletionTransportUnavailableError';
        this.registryEndpoint = registryEndpoint;
        this.originalError = originalError;
        const status = (originalError as { status?: unknown } | undefined)?.status;
        const code = (originalError as { response?: { code?: unknown } } | undefined)?.response?.code;
        this.status = typeof status === 'number' ? status : undefined;
        this.code = typeof code === 'string' ? code : undefined;

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** Error code of a registry feature that needs an active Pro plan (HTTP 402 Payment Required). */
export const PRO_PLAN_REQUIRED = 'PRO_PLAN_REQUIRED';

/**
 * The registry generates deletion transports only for accounts with an active Pro plan.
 * Handled like any unavailable deletion transport; callers can tell it apart to suggest upgrading.
 */
export class RegistryProPlanRequiredError extends RegistryDeletionTransportUnavailableError {
    constructor(registryEndpoint: string, message: string, originalError?: unknown) {
        super(registryEndpoint, message, originalError);
        this.name = 'RegistryProPlanRequiredError';

        Object.setPrototypeOf(this, new.target.prototype);
    }

    /** A registry answer meaning "needs Pro": 402, or the PRO_PLAN_REQUIRED code. */
    public static matches(error: unknown): boolean {
        const status = (error as { status?: unknown } | undefined)?.status;
        const code = (error as { response?: { code?: unknown } } | undefined)?.response?.code;
        return status === 402 || code === PRO_PLAN_REQUIRED;
    }
}
