import { Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { AbstractRegistry } from "../registry";
import { TrmArtifact } from "./TrmArtifact";
import { DEVCLASS } from "../client";
import { Transport } from "../transport";
import { SystemConnector } from "../systemConnector";

export class TrmPackage {
    private _devclass: DEVCLASS;
    private _wbTransport: Transport;

    constructor(public packageName: string, public registry: AbstractRegistry, public manifest?: Manifest) {
    }

    public setDevclass(devclass: DEVCLASS): TrmPackage {
        this._devclass = devclass;
        return this;
    }

    public getDevclass(): DEVCLASS {
        return this._devclass;
    }

    public setWbTransport(transport: Transport): TrmPackage {
        this._wbTransport = transport;
        return this;
    }

    public async getWbTransport(): Promise<Transport> {
        if(this._wbTransport === undefined){
            this._wbTransport = await SystemConnector.getPackageWorkbenchTransport(this);
        }
        return this._wbTransport;
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
        await this.registry.publish(packageName, packageVersion, artifact, readme);

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

    public static async create(manifest: Manifest, registry: AbstractRegistry): Promise<TrmPackage> {
        return new TrmPackage(manifest.get().name, registry, manifest);
    }

    public static compare(o1: TrmPackage, o2: TrmPackage): boolean {
        //this only compares name and registry NOT version!
        return o1.compareName(o2.packageName) && o1.compareRegistry(o2.registry);
    }
}