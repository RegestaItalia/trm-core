import { TRKORR } from "../client";

/** Return codes from 8 are failed imports: SAP reports errors, the objects may be partially imported. */
export const IMPORT_FAILURE_RC = 8;

/** An import (or test import) of a transport ended with a failure return code. */
export class TransportImportError extends Error {
    constructor(
        public readonly trkorr: TRKORR,
        public readonly rc: number,
        /** What the import was for, e.g. `Import of workbench`. */
        public readonly phase: string,
        public readonly tpMessage?: string
    ) {
        super(`${phase}: transport ${trkorr} ${rc < 0 ? 'has no return code (not imported)' : `ended with return code ${rc}`}${tpMessage ? ` (${tpMessage})` : ''}. Check the import log in STMS.`);
        this.name = 'TransportImportError';
    }

    /** Whether an import return code is a failure: no return code, or 8 and higher. */
    public static isFailure(rc: number): boolean {
        return rc < 0 || rc >= IMPORT_FAILURE_RC;
    }

    /** Throws when the import return code is a failure. */
    public static assert(trkorr: TRKORR, rc: number, phase: string, tpMessage?: string): void {
        if (TransportImportError.isFailure(rc)) {
            throw new TransportImportError(trkorr, rc, phase, tpMessage);
        }
    }
}
