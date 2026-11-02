/** Error code of a registry feature that needs an active Pro plan (HTTP 402 Payment Required). */
export const PRO_PLAN_REQUIRED = 'PRO_PLAN_REQUIRED';

/** A registry answer meaning "needs Pro": status 402, or the PRO_PLAN_REQUIRED code. */
export const isProPlanRequired = (status: unknown, code: unknown): boolean => status === 402 || code === PRO_PLAN_REQUIRED;
