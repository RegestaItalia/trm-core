import { BatchCompareRequest, BatchCompareResponse, Deprecate, DistTagAdd, DistTagRm, Package, PackageContents, Ping, WhoAmI } from "trm-registry-types";
import { RegistryType } from "./RegistryType";
import { TrmArtifact } from "../trmPackage";

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
    abstract publish: (fullName: string, version: string, artifact: TrmArtifact, readme?: string, tags?: string, changelog?: string) => Promise<Package | void>;
    abstract unpublish: (fullName: string, version: string) => Promise<void>;
    abstract deprecate: (fullName: string, version: string, deprecate: Deprecate) => Promise<void>;
    abstract addDistTag: (fullName: string, distTag: DistTagAdd) => Promise<void>;
    abstract rmDistTag: (fullName: string, distTag: DistTagRm) => Promise<void>;
    abstract batchCompare: (packages: BatchCompareRequest) => Promise<BatchCompareResponse>;
    abstract contents: (fullName: string, version: string) => Promise<PackageContents>;
}
