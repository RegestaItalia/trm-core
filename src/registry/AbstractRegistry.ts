import { Package, Ping, WhoAmI } from "trm-registry-types";
import { RegistryType } from "./RegistryType";
import { TrmArtifact } from "../trmPackage";

export abstract class AbstractRegistry {
    endpoint: string;
    name: string;
    abstract compare: (registry: AbstractRegistry) => boolean;
    getRegistryType: () => RegistryType;
    authenticate: (defaultData: any) => Promise<AbstractRegistry>;
    getAuthData: () => any;
    ping: () => Promise<Ping>;
    whoAmI: () => Promise<WhoAmI>;
    getPackage: (fullName: string, version: string) => Promise<Package>;
    downloadArtifact: (fullName: string, version: string) => Promise<TrmArtifact>;
    validatePublish: (fullName: string, version: string, isPrivate: boolean) => Promise<void>;
    publish: (fullName: string, version: string, artifact: TrmArtifact, readme?: string) => Promise<Package>;
    unpublish: (fullName: string, version: string) => Promise<void>;
    deprecate: (fullName: string, version: string, reason: string) => Promise<void>;
}