import { TRKORR } from "../client";
import { describeTpFailure, parseTpLog, TpLogSummary } from "./TpLog";

/**
 * A TMS operation on a transport (forward, import) failed.
 * When the error carries tp output, the message tells whether tp itself or the transport tools failed.
 */
export class TransportTmsError extends Error {
    public readonly tp?: TpLogSummary;

    constructor(
        /** e.g. `Forward`, `Import` */
        public readonly operation: string,
        public readonly trkorr: TRKORR,
        public readonly system: string,
        public readonly originalError: any
    ) {
        const tp = parseTpLog(originalError?.messageLog);
        const reason = tp ? describeTpFailure(tp, system) : (originalError instanceof Error ? originalError.message : String(originalError));
        super(`${operation} of transport ${trkorr} to ${system} failed: ${reason}`);
        this.name = 'TransportTmsError';
        this.tp = tp;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
