import { Ping, Release, View, WhoAmI } from "trm-registry-types";
import { RegistryType } from "./RegistryType";
import { TrmArtifact } from "../trmPackage";

export interface IRegistry {
    endpoint: string,
    name: string,
    getRegistryType: () => RegistryType,
    authenticate: (defaultData: any) => Promise<IRegistry>,
    getAuthData: () => any,
    ping: () => Promise<Ping>,
    whoAmI: () => Promise<WhoAmI>,
    packageExists: (name: string, version?: string) => Promise<boolean>,
    view: (name: string, version: string) => Promise<View>,
    getArtifact: (name: string, version: string) => Promise<TrmArtifact>,
    publishArtifact: (packageName: string, version: string, artifact: TrmArtifact, readme?: string) => Promise<void>,
    unpublish: (packageName: string, version: string) => Promise<void>,
    getReleases: (packageName: string, versionRange: string) => Promise<Release[]>
}