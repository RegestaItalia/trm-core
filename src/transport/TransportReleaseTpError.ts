import { TRKORR } from "../client";

/**
 * Return code of the tp test call that SAP runs before releasing a request (`EXPCHK`), when the release
 * failed on it: message TK 094 "Test call of transport control program (tp) ended with return code &3".
 * Undefined for any other error.
 */
export function getReleaseTpCheckReturnCode(error: any): number | undefined {
    const sapMessage = error?.sapMessage;
    if (`${sapMessage?.class || ''}`.trim().toUpperCase() !== 'TK' || `${sapMessage?.no || ''}`.trim() !== '094') {
        return undefined;
    }
    const returnCode = `${sapMessage.v3 || ''}`.trim();
    return /^\d+$/.test(returnCode) ? Number(returnCode) : undefined;
}

/**
 * tp internal errors (02xx): tp stopped on its own call or environment (transport profile, transport
 * directory, files in use) before looking at the request.
 */
export function isTpInternalReturnCode(returnCode: number | undefined): boolean {
    return returnCode !== undefined && returnCode >= 200 && returnCode <= 299;
}

/**
 * A release kept failing because the tp test call that precedes the export ended with a tp internal error.
 * The request was not exported and is still modifiable.
 */
export class TransportReleaseTpError extends Error {
    constructor(
        public readonly trkorr: TRKORR,
        public readonly system: string,
        public readonly returnCode: number,
        public readonly attempts: number,
        public readonly originalError: any
    ) {
        const rc = `${returnCode}`.padStart(4, '0');
        super(`Release of transport ${trkorr} failed: the transport control program (tp) check that runs before the export ` +
            `ended with tp internal error ${rc} (message TK 094) ${attempts} times in a row. ` +
            `tp stopped before reading the request, so the cause is not the package content but tp or its environment on ${system}: ` +
            `the transport profile, access to the transport directory, or one of its files being locked by another program ` +
            `(for example antivirus or backup software). A single failure is often temporary and running the action again may work; ` +
            `if it happens again, ask your SAP Basis team to check the transport tool (STMS: Overview > Systems > ${system} > Check > Transport Tool) ` +
            `and the operating system logs of the application server at the time of the failure.`);
        this.name = 'TransportReleaseTpError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
