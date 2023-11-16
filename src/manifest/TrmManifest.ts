import { Transport } from "../transport"
import { TrmManifestAuthor } from "./TrmManifestAuthor"
import { TrmManifestDependency } from "./TrmManifestDependency"

export type TrmManifest = {
    name: string,
    version: string,
    private?: boolean,
    registry?: string, //runtime
    linkedTransport?: Transport, //runtime
    distFolder?: string, //written at runtime, kept in json
    backwardsCompatible?: boolean,
    description?: string,
    git?: string,
    website?: string,
    license?: string,
    authors?: string | TrmManifestAuthor[],
    keywords?: string | string[],
    dependencies?: TrmManifestDependency[],
    sapEntries?: any
}