import { Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { AbstractRegistry } from "../registry";
import { TrmArtifact } from "./TrmArtifact";
import { DEVCLASS, ZTRM_DIRTY } from "../client";
import { Transport, TrmTransportIdentifier } from "../transport";
import { SystemConnector } from "../systemConnector";
import { Lockfile } from "../lockfile";

export type TrmPackageInstallTransport = {
    type: TrmTransportIdentifier,
    transport: Transport
}

export class TrmPackage {
    private _devclass: DEVCLASS;
    private _dirtyEntries: ZTRM_DIRTY[] = [];
    private _installTransports: TrmPackageInstallTransport[] | false;

    constructor(public packageName: string, public registry: AbstractRegistry, public manifest?: Manifest) {
    }

    public setDirtyEntries(entries: ZTRM_DIRTY[]): TrmPackage {
        this._dirtyEntries = entries;
        return this;
    }

    public isDirty(): boolean {
        return this._dirtyEntries.length > 0;
    }

    public getDirtyEntries(): ZTRM_DIRTY[] {
        return this._dirtyEntries;
    }

    public setDevclass(devclass: DEVCLASS): TrmPackage {
        this._devclass = devclass;
        return this;
    }

    public getDevclass(): DEVCLASS {
        return this._devclass;
    }

    public async publish(data: {
        artifact: TrmArtifact
        readme?: string,
        tags?: string[]
    }): Promise<TrmPackage> {
        const artifact = data.artifact;
        const trmManifest = artifact.getManifest().get();
        const packageName = trmManifest.name;
        var tags: string;
        if (packageName !== this.packageName) {
            throw new Error(`Cannot publish package ${packageName}: expected name is ${this.packageName}`);
        }
        const packageVersion = trmManifest.version;
        if(data.tags){
            tags = data.tags.join(',');
        }
        Logger.loading(`Publishing "${packageName}" ${packageVersion} to registry "${this.registry.name}"...`, false);
        await this.registry.publish(packageName, packageVersion, artifact, data.readme, tags);

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

    public async getLockfile(systemPackages?: TrmPackage[]): Promise<Lockfile> {
        return Lockfile.generate(this, systemPackages);
    }

    public static async create(manifest: Manifest, registry: AbstractRegistry): Promise<TrmPackage> {
        return new TrmPackage(manifest.get().name, registry, manifest);
    }

    public static compare(o1: TrmPackage, o2: TrmPackage): boolean {
        //this only compares name and registry NOT version!
        return o1.compareName(o2.packageName) && o1.compareRegistry(o2.registry);
    }
}