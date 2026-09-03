import { Transport } from "../transport"
import { TrmManifestBase } from "./TrmManifestBase"
import { TrmManifestNamespace } from "./TrmManifestNamespace"

export interface TrmManifest extends TrmManifestBase {
    name: string,
    version: string,
    private?: boolean,
    registry?: string, //runtime: origin registry instance
    transport?: Transport, //runtime: landscape transport or origin transport if package is temporary
    distFolder?: string, //written at runtime, kept in json
    srcFolder?: string, //written at runtime, kept in json
    namespace?: TrmManifestNamespace
}