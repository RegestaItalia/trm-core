import { Logger } from "trm-commons";
import { ClientError } from "./ClientError";

/**
 * Normalizes the log attached to a trm-server exception (`/ATRM/CX_EXCEPTION->log( )`).
 * REST returns it as an array of lines, RFC as `TLINE` rows.
 */
export function parseMessageLog(raw: any): string[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const lines = raw.map(line => `${typeof line === 'string' ? line : (line?.tdline ?? '')}`.trimEnd());
    return lines.some(line => line.length > 0) ? lines : undefined;
}

export function logMessageLog(error: ClientError): void {
    if (error.messageLog && error.messageLog.length > 0) {
        Logger.log(`Exception log:\n${error.messageLog.join('\n')}`, true);
    }
}
