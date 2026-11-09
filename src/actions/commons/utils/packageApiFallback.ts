import { Logger } from "trm-commons";
import { ClientError } from "../../../client";

/** Backend resources of the SAP package API (`CL_PACKAGE_FACTORY` / `IF_PACKAGE`): RFC function modules and REST paths. */
const PACKAGE_API_RESOURCES = [
    '/ATRM/CREATE_PACKAGE', '/ATRM/TDEVC_INTERFACE', '/ATRM/DELETE_TMP_PACKAGE',
    '/CREATE_PACKAGE', '/TDEVC_INTERFACE', '/DELETE_TMP_PACKAGE'
];

/**
 * Failures of a package API call the release can't run: a parameter it doesn't have
 * (`I_SUPPRESS_DIALOG` & co.), or the dialog it sends without it. `DYN_CALL_METH_PARAM_NOT_FOUND` is the
 * runtime error of a missing parameter trm-server doesn't catch.
 */
const UNSUPPORTED_FAILURES = ['DYN_CALL_PARAM_NOT_FOUND', 'DYN_CALL_METH_PARAM_NOT_FOUND', 'DYNPRO_SEND_IN_BACKGROUND'];

/**
 * trm-rest answers an exception trm-server doesn't catch (e.g. a missing parameter of a dynamic call) with
 * this reason, and the last system message: not the cause, so it's ignored.
 */
const REST_UNCAUGHT_EXCEPTION = 'METHOD_CALL_EXCEPTION';

function errorResource(error: any): string {
    return `${error?.resource || error?.config?.url || error?.restError?.config?.url || ''}`.trim().toUpperCase();
}

function errorTexts(error: any): string[] {
    const body = error?.response?.data ?? error?.restError?.response?.data;
    return [error?.exceptionType, error?.message, typeof body === 'string' ? body : undefined]
        .filter((text): text is string => typeof text === 'string');
}

/**
 * Whether `error`, thrown by a package API call, means the package API doesn't work on this release:
 * - a missing parameter or a dialog sent in background (also in the body of a REST dump);
 * - an exception trm-server doesn't catch, over REST (`METHOD_CALL_EXCEPTION`);
 * - an error without a message (`Type:E Number:000`): the old `CL_PACKAGE` raises without one.
 *
 * Anything else (authorizations, messages with text, connection errors) is a real error.
 */
export function isPackageApiUnsupported(error: unknown): boolean {
    const resource = errorResource(error);
    if (!PACKAGE_API_RESOURCES.some(o => resource === o || resource.endsWith(o))) {
        return false;
    }
    if (errorTexts(error).some(text => UNSUPPORTED_FAILURES.some(failure => text.includes(failure)))) {
        return true;
    }
    if (error instanceof ClientError && error.exceptionType === REST_UNCAUGHT_EXCEPTION) {
        return true;
    }
    return error instanceof ClientError && error.exceptionType !== 'TRM_RFC_UNAUTHORIZED'
        && !!error.sapMessage && !`${error.sapMessage.class || ''}`.trim();
}

/** Logs (debug) why a package API failure was classified as unsupported, so a log shows which path was taken. */
export function logPackageApiUnsupported(operation: string, error: unknown): void {
    Logger.log(`${operation}: the SAP package API is unsupported on this release (${error instanceof Error ? error.message : String(error)})`, true);
}

/** No transportable staging package can be created: the SAP package API is unsupported on this release. */
export class StagingUnavailableError extends Error {
    constructor(public namespace: string, public cause: unknown) {
        super(`A staging package${namespace ? ` in namespace ${namespace}` : ''} can't be created: the SAP package API is unsupported on this release.`);
        this.name = 'StagingUnavailableError';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Records a change the action couldn't make because the SAP package API is unsupported: it's listed,
 * once, in the summary of a successful action.
 */
export function addManualStep(context: { runtime?: { manualSteps?: string[] } }, step: string): void {
    Logger.log(`Manual step: ${step}`, true);
    context.runtime.manualSteps ||= [];
    if (!context.runtime.manualSteps.includes(step)) {
        context.runtime.manualSteps.push(step);
    }
}
