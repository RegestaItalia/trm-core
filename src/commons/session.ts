import { randomUUID } from "crypto";
import { CliLogFileLogger, Logger } from "trm-commons";

var _sessionId: string | undefined;

/**
 * ID of this TRM session: one per process, shared by the CLI log file, the `X-TRM-SESSION-ID` header
 * and the SAP action log (transaction /ATRM/LOG).
 *
 * Generated on first use. A client that creates its log file before calling this passes the ID
 * to the logger; a logger that generated its own ID (an older client) keeps its ID for the session.
 */
export function getSessionId(): string {
    if (!_sessionId) {
        _sessionId = Logger.logger instanceof CliLogFileLogger ? Logger.logger.getSessionId() : randomUUID();
    }
    return _sessionId;
}

/** Sets the ID of this TRM session, e.g. one assigned by the host application. */
export function setSessionId(sessionId: string): void {
    if (!sessionId || !sessionId.trim()) {
        throw new Error(`Invalid session ID.`);
    }
    if (sessionId.length > 36) {
        throw new Error(`Session ID "${sessionId}" exceeds 36 characters.`);
    }
    _sessionId = sessionId;
}
