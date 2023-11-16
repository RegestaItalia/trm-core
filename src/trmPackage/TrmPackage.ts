import * as semver from "semver";
import { Logger } from "../logger";
import { Manifest } from "../manifest";
import { Registry } from "../registry";
import { TrmArtifact } from "./TrmArtifact";
import { UserAuthorization, View } from "trm-registry-types";

export const DEFAULT_VERSION: string = "1.0.0";

export class TrmPackage {
    private _userAuthorizations: UserAuthorization;
    private _remoteArtifacts: any = {};

    constructor(public packageName: string, public registry: Registry, public manifest?: Manifest, private _logger?: Logger) {
        this._logger = this._logger || Logger.getDummy();
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
                if (e.response && e.response.data) {
                    view = e.response.data;
                } else {
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
        artifact: TrmArtifact,
        packageName: string,
        packageVersion: string,
        readme?: string
    }, skipLog: boolean = false): Promise<TrmPackage> {
        const logger = skipLog ? Logger.getDummy() : this._logger;
        const artifact = data.artifact;
        const packageName = data.packageName;
        const packageVersion = data.packageVersion;
        const readme = data.readme || '';
        logger.loading(`Publishing "${packageName}" ${packageVersion} to registry "${this.registry.name}"...`);
        await this.registry.publishArtifact(packageName, packageVersion, artifact, readme);
        logger.success(`"${packageName}" ${packageVersion} published.`);

        //set
        this.manifest = new Manifest(artifact.getManifest().get());
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

    public static async create(manifest: Manifest, registry: Registry, logger?: Logger): Promise<TrmPackage> {
        return new TrmPackage(manifest.get().name, registry, manifest, logger);
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