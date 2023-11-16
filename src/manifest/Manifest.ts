import * as xml from "xml-js";
import * as semver from "semver";
import { TrmManifest } from "./TrmManifest";
import { normalize } from "../commons";
import { Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { Registry } from "../registry";
import normalizeUrl from "@esm2cjs/normalize-url";
import { validate as validateEmail } from "email-validator";
import * as SpdxLicenseIds from "spdx-license-ids/index.json";
import { TrmManifestAuthor } from "./TrmManifestAuthor";
import { DOMParser } from 'xmldom';
import XmlBeautify from 'xml-beautify';


function getManifestAuthor(sAuthor: string) {
    var author: TrmManifestAuthor = {};
    const emailRegex = new RegExp("<([^>]*)>");
    const email = emailRegex.exec(sAuthor);
    if (email) {
        author.email = email[1].toLowerCase();
        sAuthor = sAuthor.replace(`<${email[1]}>`, '');
    }
    author.name = sAuthor.trim();

    return author;
}

export class Manifest {
    constructor(private _manifest: TrmManifest) {
    }

    public get(keepRuntimeValues: boolean = false): TrmManifest {
        return Manifest.normalize(this._manifest, keepRuntimeValues);
    }

    public getKey(keepVersion: boolean = true): string {
        const manifest = this.get();
        const registryEndpoint = this._manifest.registry;
        return `${manifest.name}${keepVersion ? manifest.version : ''}${registryEndpoint}`;
    }

    public setDistFolder(dist: string): Manifest {
        this._manifest.distFolder = dist;
        return this;
    }

    public setLinkedTransport(transport: Transport): Manifest {
        this._manifest.linkedTransport = transport;
        return this;
    }

    public getLinkedTransport(): Transport | null {
        return this._manifest.linkedTransport;
    }

    public setRegistryEndpoint(endpoint: string): void {
        this._manifest.registry = endpoint;
    }

    public getAbapXml(): string {
        const manifest = this.get();
        var oAbapXml = {
            "_declaration": {
                "_attributes": {
                    "version": "1.0",
                    "encoding": "utf-8"
                }
            },
            "asx:abap": {
                "_attributes": {
                    "xmlns:asx": "http://www.sap.com/abapxml",
                    "version": "1.0"
                },
                "asx:values": {
                    "TRM_MANIFEST": {
                        "NAME": {
                            "_text": manifest.name
                        },
                        "VERSION": {
                            "_text": manifest.version
                        }
                    }
                }
            }
        };
        if (manifest.description) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['DESCRIPTION'] = {
                "_text": manifest.description
            }
        }
        if (manifest.private) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['PRIVATE'] = {
                "_text": "X"
            }
        }
        if (manifest.backwardsCompatible) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['BACKWARDS_COMPATIBLE'] = {
                "_text": "X"
            }
        }
        if (manifest.git) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['GIT'] = {
                "_text": manifest.git
            }
        }
        if (manifest.website) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['WEBSITE'] = {
                "_text": manifest.website
            }
        }
        if (manifest.license) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['LICENSE'] = {
                "_text": manifest.license
            }
        }
        if (manifest.authors) {
            var authors = [];
            (manifest.authors as TrmManifestAuthor[]).forEach(o => {
                var obj: any = {};
                if (o.name) {
                    obj['NAME'] = {
                        "_text": o.name
                    }
                }
                if (o.email) {
                    obj['EMAIL'] = {
                        "_text": o.email
                    }
                }
                if (Object.keys(obj).length > 0) {
                    authors.push(obj);
                }
            });
            if (authors.length > 0) {
                oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['AUTHORS'] = {
                    "item": authors
                }
            }
        }
        if (manifest.keywords) {
            var keywords = (manifest.keywords as string[]).map(o => {
                return {
                    "_text": o
                }
            });
            if (keywords.length > 0) {
                oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['KEYWORDS'] = {
                    "item": keywords
                }
            }
        }
        if (manifest.dependencies) {
            var dependencies = [];
            manifest.dependencies.forEach((o: any) => {
                var obj: any = {};
                if (o.name) {
                    obj['NAME'] = {
                        "_text": o.name
                    }
                }
                if (o.version) {
                    obj['VERSION'] = {
                        "_text": o.version
                    }
                }
                if (o.registry) {
                    obj['REGISTRY'] = {
                        "_text": o.registry
                    }
                }
                if (o.integrity) {
                    obj['INTEGRITY'] = {
                        "_text": o.integrity
                    }
                }
                if (Object.keys(obj).length > 0) {
                    dependencies.push(obj);
                }
            });
            if (dependencies.length > 0) {
                oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['DEPENDENCIES'] = {
                    "item": dependencies
                }
            }
        }
        if (manifest.sapEntries) {
            var sapEntries = [];
            Object.keys(manifest.sapEntries).forEach(table => {
                try {
                    var tableItems = [];
                    manifest.sapEntries[table].forEach(r => {
                        var record = {};
                        Object.keys(r).forEach(k => {
                            record[k] = {
                                "_text": r[k]
                            }
                        });
                        if (Object.keys(record).length > 0) {
                            tableItems.push(record);
                        }
                    });
                    sapEntries.push({
                        "TABLE": table,
                        "ENTRIES": {
                            "item": tableItems
                        }
                    });
                } catch (e) { }
            });
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['SAP_ENTRIES'] = {
                "item": sapEntries
            }
        }
        const sXml = xml.js2xml(oAbapXml, { compact: true });
        return sXml ? new XmlBeautify({ useSelfClosingElement: true, parser: DOMParser }).beautify(sXml) : null;
    }

    public getPackage(): TrmPackage {
        const manifest = this.get(true);
        const registry = new Registry(manifest.registry || 'public');
        return new TrmPackage(manifest.name, registry, this);
    }

    public static normalize(manifest: TrmManifest, keepRuntimeValues: boolean): TrmManifest {
        //this function is also used for method get()
        //only keys will throw error
        //always check if property has value
        if (!keepRuntimeValues) {
            delete manifest.linkedTransport;
            delete manifest.registry;
        }
        if (!manifest.name) {
            throw new Error('Package name missing.')
        } else {
            manifest.name = manifest.name.trim().toLowerCase().replace(/\s/g, '');
        }
        if (!manifest.version) {
            throw new Error('Package version missing.');
        } else {
            manifest.version = semver.clean(manifest.version);
            if (!manifest.version) {
                throw new Error('Invalid package version declared.');
            }
        }
        manifest.private = manifest.private ? true : false;
        manifest.backwardsCompatible = manifest.backwardsCompatible ? true : false;
        if (manifest.git) {
            try {
                manifest.git = normalizeUrl(manifest.git);
            } catch (e) {
                delete manifest.git;
            }
        } else {
            delete manifest.git;
        }
        if (manifest.website) {
            try {
                manifest.website = normalizeUrl(manifest.website);
            } catch (e) {
                delete manifest.website;
            }
        } else {
            delete manifest.website;
        }
        if (manifest.license) {
            try {
                const spdxLicenseIdsWrapper: any = SpdxLicenseIds;
                const aSpdxLicenseIds = spdxLicenseIdsWrapper.default;
                const inLicense = manifest.license.trim();
                const lLicense = inLicense.toLowerCase();
                const uLicense = inLicense.toUpperCase();
                if (aSpdxLicenseIds.includes(inLicense)) {
                    manifest.license = inLicense;
                } else if (aSpdxLicenseIds.includes(lLicense)) {
                    manifest.license = lLicense;
                } else if (aSpdxLicenseIds.includes(uLicense)) {
                    manifest.license = uLicense;
                } else {
                    delete manifest.license;
                }
            } catch (e) {
                delete manifest.license;
            }
        } else {
            delete manifest.license;
        }
        if (manifest.authors) {
            var aAuthors;
            if (typeof (manifest.authors) === 'string') {
                aAuthors = manifest.authors.split(',');
            } else {
                aAuthors = manifest.authors;
            }
            for (var i = 0; i < aAuthors.length; i++) {
                try {
                    var author: TrmManifestAuthor;
                    if (typeof (aAuthors[i]) === 'string') {
                        author = getManifestAuthor(aAuthors[i] as string);
                    }
                    if (author.email) {
                        if (!validateEmail(author.email)) {
                            delete author.email;
                        }
                    }

                    aAuthors[i] = author;
                } catch (e) { }
            }
            manifest.authors = aAuthors;
            if (manifest.authors.length === 0) {
                delete manifest.authors;
            }
        } else {
            delete manifest.authors;
        }
        if (manifest.keywords) {
            var originalKeywords;
            if (typeof (manifest.keywords) === 'string') {
                originalKeywords = manifest.keywords.split(',');
            } else {
                originalKeywords = manifest.keywords;
            }
            manifest.keywords = [];
            for (var originalKeyword of originalKeywords) {
                try {
                    originalKeyword = originalKeyword.replace(/\s/g, '').toLowerCase();
                    manifest.keywords.push(originalKeyword);
                } catch (e) { }
            }
            if (manifest.keywords.length === 0) {
                delete manifest.keywords;
            }
        } else {
            delete manifest.keywords;
        }
        if (manifest.dependencies) {
            const originalDependencies = manifest.dependencies;
            manifest.dependencies = [];
            for (var originalDependency of originalDependencies) {
                try {
                    var dependency: any = {};
                    if (originalDependency.name) {
                        dependency.name = originalDependency.name.trim().toLowerCase().replace(/\s/g, '');
                        if (semver.validRange(originalDependency.version)) {
                            dependency.version = originalDependency.version;
                            dependency.integrity = originalDependency.integrity;
                            if(originalDependency.registry){
                                dependency.registry = originalDependency.registry;
                            }
                            manifest.dependencies.push(dependency);
                        }
                    }
                } catch (e) { }
            }
            if (manifest.dependencies.length === 0) {
                delete manifest.dependencies;
            }
        } else {
            delete manifest.dependencies;
        }
        if (!manifest.sapEntries) {
            delete manifest.sapEntries;
        }
        if (manifest.distFolder) {
            try {
                manifest.distFolder = manifest.distFolder.replace(/^\//, '');
                manifest.distFolder = manifest.distFolder.replace(/\/$/, '');
            } catch (e) {
                delete manifest.distFolder;
            }
        } else {
            delete manifest.distFolder;
        }
        return manifest;
    }

    public static fromAbapXml(sXml: string): Manifest {
        var manifest: TrmManifest;
        const oAbapXml = xml.xml2js(sXml, { compact: true });
        var oAbapManifest;
        try {
            oAbapManifest = normalize(oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']);
            manifest = {
                name: oAbapManifest.name.text,
                version: oAbapManifest.version.text,
                backwardsCompatible: false, //default overwitten later
                private: false, //default overwitten later,
                registry: 'public' //default overwritten later
            };
        } catch (e) {
            throw new Error('XML Manifest is corrupted.');
        }
        if (oAbapManifest.description && oAbapManifest.description.text) {
            manifest.description = oAbapManifest.description.text;
        }
        if (oAbapManifest.backwardsCompatible && oAbapManifest.backwardsCompatible.text) {
            manifest.backwardsCompatible = oAbapManifest.backwardsCompatible.text === 'X';
        }
        if (oAbapManifest.private && oAbapManifest.private.text) {
            manifest.private = oAbapManifest.private.text === 'X';
        }
        if (oAbapManifest.registry && oAbapManifest.registry.text) {
            manifest.registry = oAbapManifest.registry;
        }
        if (oAbapManifest.git && oAbapManifest.git.text) {
            manifest.git = oAbapManifest.git.text;
        }
        if (oAbapManifest.website && oAbapManifest.website.text) {
            manifest.website = oAbapManifest.website.text;
        }
        if (oAbapManifest.license && oAbapManifest.license.text) {
            manifest.license = oAbapManifest.license.text;
        }
        if (oAbapManifest.keywords && oAbapManifest.keywords.item) {
            if (Array.isArray(oAbapManifest.keywords.item)) {
                manifest.keywords = oAbapManifest.keywords.item.map(o => o.text);
            } else {
                manifest.keywords = [oAbapManifest.keywords.item.text];
            }
        }
        if (oAbapManifest.authors && oAbapManifest.authors.item) {
            if (Array.isArray(oAbapManifest.authors.item)) {
                manifest.authors = oAbapManifest.authors.item.map(o => {
                    return {
                        name: o.name?.text,
                        email: o.email?.text
                    };
                });
            } else {
                manifest.authors = [{
                    name: oAbapManifest.authors.item.name?.text,
                    email: oAbapManifest.authors.item.email?.text
                }];
            }
        }
        //TODO complete sapEntries dependencies
        return new Manifest(Manifest.normalize(manifest, false));
    }

    public static fromJson(sJson: string): Manifest {
        return new Manifest(Manifest.normalize(JSON.parse(sJson), false));
    }

    public static compare(o1: Manifest, o2: Manifest, checkVersion: boolean = false): boolean {
        const s1 = o1.getKey(checkVersion);
        const s2 = o2.getKey(checkVersion);
        return s1 === s2;
    }

}