import { TRKORR } from "../client";
import { TrmTransportIdentifier, BinaryTransport } from "../transport";

export type TransportBinary = {
    trkorr: TRKORR,
    type?: TrmTransportIdentifier,
    binaries: BinaryTransport
};