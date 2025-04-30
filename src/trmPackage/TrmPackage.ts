import * as semver from "semver";
import { Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { AbstractRegistry } from "../registry";
import { TrmArtifact } from "./TrmArtifact";
import { UserAuthorization, View } from "trm-registry-types";
import { DEVCLASS } from "../client";
import { R3transOptions } from "node-r3trans";

export const DEFAULT_VERSION: string = "1.0.0";

export class TrmPackage {
    private _userAuthorizations: UserAuthorization;
    private _canPublishReleasesCause: string;
    private _remoteArtifacts: any = {};
    private _remoteContent: any = {};
    private _devclass: DEVCLASS;

    constructor(public packageName: string, public registry: AbstractRegistry, public manifest?: Manifest) {
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

    public async canPublishReleases(): Promise<{
        canPublishReleases: boolean,
        cause?: string
    }> {
        if (this._userAuthorizations === undefined) {
            var view: View;
            try {
                view = await this._viewLatest();
            } catch (e) {
                this._canPublishReleasesCause = e.message;
                if (e.response && typeof (e.response) === "object") {
                    view = e.response;
                } else {
                    throw e;
                }
            }
            this._userAuthorizations = view.userAuthorizations;
        }
        return {
            canPublishReleases: this._userAuthorizations.canCreateReleases,
            cause: this._canPublishReleasesCause
        };
    }

    public async fetchRemoteArtifact(version: string = 'latest'): Promise<TrmArtifact> {
        if (!this._remoteArtifacts[version]) {
            this._remoteArtifacts[version] = await this.registry.getArtifact(this.packageName, version);
        }
        return this._remoteArtifacts[version];
    }

    public async fetchRemoteManifest(version: string = 'latest'): Promise<Manifest> {
        const artifact = await this.fetchRemoteArtifact(version);
        this.manifest = artifact.getManifest();

        //re-write with actual manifest version
        this._remoteArtifacts[this.manifest.get().version] = this._remoteArtifacts[version];

        return this._remoteArtifacts[version].getManifest();
    }

    public async fetchRemoteContent(version: string = 'latest', r3transConfig?: R3transOptions): Promise<any> {
        if (!this._remoteContent[version]) {
            const artifact = await this.fetchRemoteArtifact(version);
            const manifest = artifact.getManifest();
            const actualVersion = manifest.get().version;
            this._remoteArtifacts[version] = await artifact.getContent(r3transConfig);

            //re-write with actual manifest version
            this._remoteArtifacts[actualVersion] = this._remoteArtifacts[version];
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
        if (packageName !== this.packageName) {
            throw new Error(`Cannot publish package ${packageName}: expected name is ${this.packageName}`);
        }
        const packageVersion = trmManifest.version;
        const readme = data.readme || '';
        Logger.loading(`Publishing "${packageName}" ${packageVersion} to registry "${this.registry.name}"...`, false);
        await this.registry.publishArtifact(packageName, packageVersion, artifact, readme);

        //set
        this.manifest = new Manifest(trmManifest);
        return this;
    }

    public compareRegistry(registry: AbstractRegistry): boolean {
        return this.registry.compare(registry);
    }

    public compareName(name: string): boolean {
        return this.packageName.trim().toUpperCase() === name.trim().toUpperCase();
    }

    private async _viewLatest(): Promise<View> {
        return (await this.registry.view(this.packageName, 'latest'));
    }

    public static async create(manifest: Manifest, registry: AbstractRegistry): Promise<TrmPackage> {
        return new TrmPackage(manifest.get().name, registry, manifest);
    }

    public static compare(o1: TrmPackage, o2: TrmPackage): boolean {
        //this only compares name and registry NOT version!
        return o1.compareName(o2.packageName) && o1.compareRegistry(o2.registry);
    }

    public static async normalizeVersion(packageName: string, version: string, registry: AbstractRegistry): Promise<string> {
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
                if (versionExists) {
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