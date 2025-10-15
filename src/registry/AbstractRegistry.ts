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
    validatePublish: (fullName: string, version: string) => Promise<void>;
    publish: (fullName: string, version: string, artifact: TrmArtifact, readme?: string) => Promise<void>;
    unpublish: (fullName: string, version: string) => Promise<void>;
}