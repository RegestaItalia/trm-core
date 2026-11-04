import { BatchCompareRequest, BatchCompareResponse, Deprecate, DistTagAdd, DistTagRm, Namespace, Package, PackageInfo, PackageManifest, Ping, Readme, Search, SearchRequest, TelemetryRequest, WhoAmI } from "trm-registry-types";
import { RegistryType } from "./RegistryType";
import { TrmArtifact } from "../trmPackage";
import { BinaryTransport } from "../transport";
import { DeleteTransportOptions, DeletionTransport } from "./DeletionTransport";
import { TransportEntries } from "../client";
import { ReleaseDiffOptions, ReleaseDiffReport } from "./ReleaseDiff";

export interface PublishAdditionalData {
    readme?: string,
    tags?: string,
    changelog?: string,
    retainedCustomizing?: string[]
}

/** Release data returned by a registry after publication. */
export interface PublishResult {
    /** Integrity of the release as stored by the registry, when it can differ from the uploaded artifact. */
    integrity?: string
}

export abstract class AbstractRegistry {
    endpoint: string;
    name: string;
    abstract compare: (registry: AbstractRegistry) => boolean;
    abstract getRegistryType: () => RegistryType;
    abstract authenticate: (defaultData: any) => Promise<AbstractRegistry>;
    abstract getAuthData: () => any;
    abstract ping: () => Promise<Ping>;
    abstract whoAmI: () => Promise<WhoAmI>;
    abstract getPackage: (fullName: string, version: string) => Promise<Package>;
    abstract downloadArtifact: (fullName: string, version: string) => Promise<TrmArtifact>;
    abstract validatePublish: (fullName: string, version: string, isPrivate: boolean) => Promise<void>;
    abstract publish: (fullName: string, version: string, artifact: TrmArtifact, additionalData?: PublishAdditionalData) => Promise<PublishResult | void>;
    abstract unpublish: (fullName: string, version: string) => Promise<void>;
    abstract deprecate: (fullName: string, version: string, deprecate: Deprecate) => Promise<void>;
    abstract addDistTag: (fullName: string, distTag: DistTagAdd) => Promise<void>;
    abstract rmDistTag: (fullName: string, distTag: DistTagRm) => Promise<void>;
    abstract batchCompare: (packages: BatchCompareRequest) => Promise<BatchCompareResponse>;
    abstract transport: (trkorr: string, target?: string) => Promise<BinaryTransport>;
    abstract transportEntries: (fullName: string, version: string, trkorr: string) => Promise<TransportEntries>;
    /**
     * Generates a deletion transport from `transport` (a transport of copies of what is installed). With `options`,
     * only its content not shipped by `options.subtract` and not in `options.exclude` is deleted, renamed to `options.target`.
     * Throws {@link RegistryDeletionTransportUnavailableError} when the registry can't generate it.
     */
    abstract delete: (transport: BinaryTransport, options?: DeleteTransportOptions) => Promise<DeletionTransport>;
    /**
     * Differences between releases `from` and `to` of a package, computed by the registry (it may take a while:
     * progress is reported to `options.onProgress`). Throws {@link RegistryDiffError} when the registry can't
     * provide it (no Pro plan, unknown release, comparison failed, diffs not supported).
     */
    abstract diff: (fullName: string, from: string, to: string, options?: ReleaseDiffOptions) => Promise<ReleaseDiffReport>;

    /*
     * Optional navigation features: a registry that doesn't implement one throws
     * {@link RegistryFeatureUnsupportedError}. An unknown or unreadable package (or release)
     * throws {@link RegistryPackageNotFoundError}. `version` defaults to `latest`.
     */
    /** Searches packages (paginated). */
    abstract search: (req: SearchRequest) => Promise<Search>;
    /** Navigation metadata of a package release. */
    abstract getPackageInfo: (fullName: string, version?: string) => Promise<PackageInfo>;
    /** README of a package release (`readme` is `null` when the release has none). */
    abstract getReadme: (fullName: string, version?: string) => Promise<Readme>;
    /** Complete manifest of a package release. */
    abstract getManifest: (fullName: string, version?: string) => Promise<PackageManifest>;
    /** Namespace shipped by a package release; not found when the release has no namespace. */
    abstract getNamespace: (fullName: string, version?: string) => Promise<Namespace>;

    /**
     * Sends an opt-in, anonymous telemetry event. It must be transparent to the user: it never throws,
     * and registries that don't accept telemetry are skipped silently.
     */
    abstract telemetry: (event: TelemetryRequest) => Promise<void>;
}
