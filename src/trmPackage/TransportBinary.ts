import { TRKORR, TransportEntries } from "../client";
import { TrmTransportIdentifier, BinaryTransport } from "../transport";

export type TransportBinary = {
    trkorr: TRKORR,
    type?: TrmTransportIdentifier,
    binaries: BinaryTransport,
    entries: TransportEntries,
    /** SHA-512 (base64) of the packed entries JSON, set when read from an artifact. */
    entriesChecksum?: string
};
