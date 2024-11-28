
import { Transport } from "../transport"
import { TrmManifestBase } from "./TrmManifestBase"
import { TrmManifestNamespace } from "./TrmManifestNamespace"

export interface TrmManifest extends TrmManifestBase {
    name: string,
    version: string,
    private?: boolean,
    registry?: string, //runtime
    linkedTransport?: Transport, //runtime
    distFolder?: string, //written at runtime, kept in json
    namespace?: TrmManifestNamespace
}