import * as semver from "semver";
import { Logger } from "../logger";
import { Manifest } from "../manifest";
import { Registry } from "../registry";
import { TrmArtifact } from "./TrmArtifact";
import { UserAuthorization, View } from "trm-registry-types";
import { DEVCLASS } from "../client";

export const DEFAULT_VERSION: string = "1.0.0";

export class TrmPackage {
    private _userAuthorizations: UserAuthorization;
    private _remoteArtifacts: any = {};
    private _devclass: DEVCLASS;

    constructor(public packageName: string, public registry: Registry, public manifest?: Manifest) {
    }

    public setDevclass(devclass: DEVCLASS): TrmPackage {
        this._devclass = devclass;
        return this;
    }

    public getDevclass(): DEVCLASS {
        return this._devclass;
    }

    public async exists(version: string = 'latest'): Promise<boolean> {
        return (await this.registry.packageExists(this.packageName, version));
    }

    public async canPublishReleases(): Promise<boolean> {
        if (this._userAuthorizations === undefined) {
            var view: View;
            try {
                view = await this._viewLatest();
            } catch (e) {
                /*if (e.response && e.response.data) {
                    view = e.response.data;
                } else {
                    throw e;
                }*/
                if(e.response){
                    view = e.response;
                }else{
                    throw e;
                }
            }
            this._userAuthorizations = view.userAuthorizations;
        }
        return this._userAuthorizations.canCreateReleases;
    }

    public async fetchRemoteManifest(version: string = 'latest'): Promise<Manifest> {
        if(!this._remoteArtifacts[version]){
            const artifact = await this.registry.getArtifact(this.packageName, version);
            this._remoteArtifacts[version] = artifact;
            this.manifest = artifact.getManifest();
            this._remoteArtifacts[this.manifest.get().version] = artifact;
        }
        return this._remoteArtifacts[version].getManifest();
    }

    public async fetchRemoteArtifact(version: string = 'latest'): Promise<TrmArtifact> {
        if(!this._remoteArtifacts[version]){
            this._remoteArtifacts[version] = await this.registry.getArtifact(this.packageName, version);
        }
        return this._remoteArtifacts[version];
    }

    public async publish(data: {
        artifact: TrmArtifact
        readme?: string
    }): Promise<TrmPackage> {
        const artifact = data.artifact;
        const trmManifest = artifact.getManifest().get();
        const packageName = trmManifest.name;
        if(packageName !== this.packageName){
            throw new Error(`Cannot publish package ${packageName}: expected name is ${this.packageName}`);
        }
        const packageVersion = trmManifest.version;
        const readme = data.readme || '';
        Logger.loading(`Publishing "${packageName}" ${packageVersion} to registry "${this.registry.name}"...`, false);
        await this.registry.publishArtifact(packageName, packageVersion, artifact, readme);
        Logger.success(`"${packageName}" ${packageVersion} published.`, false);

        //set
        this.manifest = new Manifest(trmManifest);
        return this;
    }

    public compareRegistry(registry: Registry): boolean {
        return Registry.compare(this.registry, registry);
    }

    public compareName(name: string): boolean {
        return this.packageName.trim().toUpperCase() === name.trim().toUpperCase();
    }

    private async _viewLatest(): Promise<View> {
        return (await this.registry.view(this.packageName, 'latest'));
    }

    public static async create(manifest: Manifest, registry: Registry): Promise<TrmPackage> {
        return new TrmPackage(manifest.get().name, registry, manifest);
    }

    public static compare(o1: TrmPackage, o2: TrmPackage): boolean {
        //this only compares name and registry NOT version!
        return o1.compareName(o2.packageName) && o1.compareRegistry(o2.registry);
    }

    public static async normalizeVersion(packageName: string, version: string, registry: Registry): Promise<string> {
        const oPackage = new TrmPackage(packageName, registry);
        const usingLatest = version.trim().toLowerCase() === 'latest';
        if (!usingLatest) {
            version = semver.clean(version);
            if (!version) {
                throw new Error('Version not supported.');
            }
        }
        const exists = await oPackage.exists();
        if (!exists) {
            if (usingLatest) {
                version = DEFAULT_VERSION;
            }
        } else {
            if (!usingLatest) {
                const versionExists = await oPackage.exists(version);
                if(versionExists){
                    throw new Error(`Package "${packageName}" versioned ${version} already published.`);
                }
            } else {
                const oManifest = await oPackage.fetchRemoteManifest('latest');
                const latestPublishedManifest = oManifest.get();
                version = semver.inc(latestPublishedManifest.version, 'patch');
            }
        }
        return version;
    }
}