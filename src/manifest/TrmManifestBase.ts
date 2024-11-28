import { TrmManifestAuthor } from "./TrmManifestAuthor"
import { TrmManifestDependency } from "./TrmManifestDependency"

export interface TrmManifestBase {
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