import * as xml from "xml-js";
import * as semver from "semver";
import { TrmManifest } from "./TrmManifest";
import { jsonStringifyWithKeyOrder, normalize } from "../commons";
import { Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { PUBLIC_RESERVED_KEYWORD, RegistryProvider } from "../registry";
import normalizeUrl from "@esm2cjs/normalize-url";
import { validate as validateEmail } from "email-validator";
import * as SpdxLicenseIds from "spdx-license-ids/index.json";
import { TrmManifestAuthor } from "./TrmManifestAuthor";
import { DOMParser } from '@xmldom/xmldom';
import _ from 'lodash';
import XmlBeautify from 'xml-beautify';
import { Logger } from "trm-commons";


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
    constructor(private _manifest: TrmManifest, private _filePath?: string) {
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

    public setSrcFolder(src: string): Manifest {
        this._manifest.srcFolder = src;
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

    public getJSON(ignoredKeys: string[] = []): string {
        const KEYS_ORDER = [
            "name",
            "version",
            "registry",
            "private",
            "description",
            "backwardsCompatible",
            "distFolder",
            "srcFolder",
            "namespace",
            "website",
            "git",
            "license",
            "authors",
            "keywords",
            "dependencies",
            "sapEntries",
            "postActivities"
        ] satisfies readonly (keyof TrmManifest & string)[];
        var obj = this.get(false);
        ignoredKeys.forEach(k => {
            delete obj[k];
        })
        return jsonStringifyWithKeyOrder(obj, KEYS_ORDER, 2);
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
        if (manifest.registry) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['REGISTRY'] = {
                "_text": manifest.registry
            }
        }
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
        if (manifest.namespace) {
            oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['REPLICENSE'] = {
                "_text": manifest.namespace.replicense
            }
            if (Array.isArray(manifest.namespace.texts)) {
                var texts = [];
                manifest.namespace.texts.forEach(o => {
                    var obj: any = {};
                    if (o.description) {
                        obj['DESCRIPTION'] = {
                            "_text": o.description
                        }
                    }
                    if (o.language) {
                        obj['LANGUAGE'] = {
                            "_text": o.language
                        }
                    }
                    if (o.owner) {
                        obj['OWNER'] = {
                            "_text": o.owner
                        }
                    }
                    if (Object.keys(obj).length > 0) {
                        texts.push(obj);
                    }
                });
                if (texts.length > 0) {
                    oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['REPLICENSE_T'] = {
                        "item": texts
                    }
                }
            }
            if (manifest.namespace.ns) {
                oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['NS'] = {
                    "_text": manifest.namespace.ns
                }
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
            if (sapEntries.length > 0) {
                oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['SAP_ENTRIES'] = {
                    "item": sapEntries
                }
            }
        }
        if (manifest.postActivities) {
            var postActivities = [];
            manifest.postActivities.forEach(pa => {
                var postActivity = {
                    'NAME': {
                        "_text": pa.name
                    }
                }
                if (pa.parameters && pa.parameters.length > 0) {
                    postActivity['PARAMETERS'] = {
                        "item": pa.parameters.map(param => {
                            return {
                                'NAME': {
                                    "_text": param.name
                                },
                                'VALUE': {
                                    "_text": param.value
                                },
                            };
                        })
                    };
                }
                postActivities.push(postActivity);
            });
            if (postActivities.length > 0) {
                oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['POST_ACTIVITIES'] = {
                    "item": postActivities
                }
            }
        }
        const sXml = xml.js2xml(oAbapXml, { compact: true });
        return sXml ? new XmlBeautify({ useSelfClosingElement: true, parser: DOMParser }).beautify(sXml) : null;
    }

    public getPackage(): TrmPackage {
        const manifest = this.get(true);
        const registry = RegistryProvider.getRegistry(manifest.registry, this._filePath);
        return new TrmPackage(manifest.name, registry, this);
    }

    public static normalize(manifest: TrmManifest, keepRuntimeValues: boolean): TrmManifest {
        //this function is also used for method get()
        //only keys will throw error
        //always check if property has value
        var manifestClone = _.cloneDeep(manifest);
        if (!keepRuntimeValues) {
            delete manifestClone.linkedTransport;
        }
        if (!manifestClone.name) {
            throw new Error('Package name missing.')
        } else {
            manifestClone.name = manifestClone.name.trim().toLowerCase().replace(/\s/g, '');
        }
        if (!manifestClone.version) {
            throw new Error('Package version missing.');
        } else {
            manifestClone.version = semver.clean(manifestClone.version);
            if (!manifestClone.version) {
                throw new Error('Invalid package version declared.');
            }
        }
        if (manifestClone.registry) {
            if (manifestClone.registry === PUBLIC_RESERVED_KEYWORD) {
                delete manifestClone.registry;
            }
        }
        manifestClone.private = manifestClone.private ? true : false;
        manifestClone.backwardsCompatible = manifestClone.backwardsCompatible ? true : false;
        if (manifestClone.git) {
            try {
                manifestClone.git = normalizeUrl(manifestClone.git);
            } catch (e) {
                delete manifestClone.git;
            }
        } else {
            delete manifestClone.git;
        }
        if (manifestClone.website) {
            try {
                manifestClone.website = normalizeUrl(manifestClone.website);
            } catch (e) {
                delete manifestClone.website;
            }
        } else {
            delete manifestClone.website;
        }
        if (manifestClone.license) {
            try {
                const spdxLicenseIdsWrapper: any = SpdxLicenseIds;
                const aSpdxLicenseIds = spdxLicenseIdsWrapper.default;
                const inLicense = manifestClone.license.trim();
                const lLicense = inLicense.toLowerCase();
                const uLicense = inLicense.toUpperCase();
                if (aSpdxLicenseIds.includes(inLicense)) {
                    manifestClone.license = inLicense;
                } else if (aSpdxLicenseIds.includes(lLicense)) {
                    manifestClone.license = lLicense;
                } else if (aSpdxLicenseIds.includes(uLicense)) {
                    manifestClone.license = uLicense;
                } else {
                    delete manifestClone.license;
                }
            } catch (e) {
                delete manifestClone.license;
            }
        } else {
            delete manifestClone.license;
        }
        if (manifestClone.namespace) {
            if (!manifestClone.namespace.replicense) {
                throw new Error('Missing namespace repair license.');
            }
            manifestClone.namespace.replicense = manifestClone.namespace.replicense.trim();
            if (!/^\d+$/.test(manifestClone.namespace.replicense)) {
                throw new Error('Invalid characters in namespace repair license.');
            }
            if (manifestClone.namespace.replicense.length !== 20) {
                throw new Error(`Namespace has invalid repair license: length must be 20`);
            }
            if (!manifestClone.namespace.texts || manifestClone.namespace.texts.length === 0) {
                throw new Error('Invalid namespace data: missing texts.');
            }
            manifestClone.namespace.texts.forEach(o => {
                if (!o.language || !o.description || !o.owner) {
                    throw new Error('Missing namespace data.');
                }
                if (o.language.length !== 1) {
                    throw new Error(`Namespace has invalid language ${o.language}`);
                }
                if (o.description.length > 60) {
                    throw new Error(`Namespace has invalid description: maximum length is 60`);
                }
                if (o.owner.length > 20) {
                    throw new Error(`Namespace has invalid owner: maximum length is 20`);
                }
            });
        } else {
            delete manifestClone.namespace;
        }
        if (manifestClone.authors) {
            var aAuthors;
            if (typeof (manifestClone.authors) === 'string') {
                aAuthors = this.stringAuthorsToArray(manifestClone.authors);
            } else {
                aAuthors = manifestClone.authors;
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
                    } else {
                        delete author.email;
                    }
                    aAuthors[i] = author;
                } catch (e) { }
            }
            aAuthors = aAuthors.filter(o => !(!o.name && !o.email));
            manifestClone.authors = Array.from(
                new Map(aAuthors.map(o => [`${o.name}${o.email}`, o])).values()
            );
            if (manifestClone.authors.length === 0) {
                delete manifestClone.authors;
            }
        } else {
            delete manifestClone.authors;
        }
        if (manifestClone.keywords) {
            var originalKeywords;
            if (typeof (manifestClone.keywords) === 'string') {
                originalKeywords = this.stringKeywordsToArray(manifestClone.keywords);
            } else {
                originalKeywords = manifestClone.keywords;
            }
            manifestClone.keywords = [];
            for (var originalKeyword of originalKeywords) {
                try {
                    originalKeyword = originalKeyword.replace(/\s/g, '').toLowerCase();
                    if (!originalKeyword || !manifestClone.keywords.includes(originalKeyword)) {
                        manifestClone.keywords.push(originalKeyword);
                    }
                } catch (e) { }
            }
            if (manifestClone.keywords.length === 0) {
                delete manifestClone.keywords;
            }
        } else {
            delete manifestClone.keywords;
        }
        if (manifestClone.dependencies) {
            const originalDependencies = manifestClone.dependencies;
            manifestClone.dependencies = [];
            for (var originalDependency of originalDependencies) {
                try {
                    var dependency: any = {};
                    if (originalDependency.name) {
                        dependency.name = originalDependency.name.trim().toLowerCase().replace(/\s/g, '');
                        if (semver.validRange(originalDependency.version)) {
                            dependency.version = originalDependency.version;
                            if (originalDependency.registry) {
                                dependency.registry = originalDependency.registry;
                            }
                            if (!manifestClone.dependencies.find(o => o.name === dependency.name && o.registry === dependency.registry)) {
                                manifestClone.dependencies.push(dependency);
                            }
                        }
                    }
                } catch (e) { }
            }
            if (manifestClone.dependencies.length === 0) {
                delete manifestClone.dependencies;
            }
        } else {
            delete manifestClone.dependencies;
        }
        if (!manifestClone.sapEntries || typeof manifestClone.sapEntries !== 'object') {
            delete manifestClone.sapEntries;
        } else {
            for (const key in manifestClone.sapEntries) {
                if (!Array.isArray(manifestClone.sapEntries[key])) {
                    throw new Error(`Invalid structure in SAP entries declaration.`);
                }
                for (const item of manifestClone.sapEntries[key]) {
                    if (typeof item !== 'object' || item === null) {
                        throw new Error(`Invalid structure in SAP entries declaration.`);
                    }
                }
            }
        }
        if (manifestClone.distFolder) {
            try {
                manifestClone.distFolder = manifestClone.distFolder.replace(/^\//, '');
                manifestClone.distFolder = manifestClone.distFolder.replace(/\/$/, '');
            } catch (e) {
                delete manifestClone.distFolder;
            }
        } else {
            delete manifestClone.distFolder;
        }
        if (manifestClone.srcFolder) {
            try {
                manifestClone.srcFolder = manifestClone.srcFolder.replace(/^\//, '');
                manifestClone.srcFolder = manifestClone.srcFolder.replace(/\/$/, '');
            } catch (e) {
                delete manifestClone.srcFolder;
            }
        } else {
            delete manifestClone.srcFolder;
        }
        if (manifestClone.postActivities && manifestClone.postActivities.length > 0) {
            var originalPostActivities = manifestClone.postActivities;
            delete manifestClone.postActivities;
            if (Array.isArray(originalPostActivities) && originalPostActivities.length > 0) {
                manifestClone.postActivities = [];
                originalPostActivities.forEach((pa) => {
                    if (!pa.name) {
                        throw new Error(`Invalid post activity: name must be declared.`);
                    }
                    pa.name = pa.name.toUpperCase();
                    if (Array.isArray(pa.parameters)) {
                        pa.parameters.forEach(param => {
                            if (!param.name) {
                                throw new Error(`Invalid post activity: parameter name must be declared.`);
                            }
                            param.name = param.name.toUpperCase();
                        })
                        manifestClone.postActivities.push({
                            name: pa.name,
                            parameters: pa.parameters
                        });
                    } else {
                        manifestClone.postActivities.push({
                            name: pa.name
                        });
                    }
                });
            }
        } else {
            delete manifestClone.postActivities;
        }
        return manifestClone;
    }

    public static fromAbapXml(sXml: string): Manifest {
        var manifest: TrmManifest;
        sXml = sXml.replace(/&/g, "&amp;").replace(/-/g, "&#45;");
        const oAbapXml = xml.xml2js(sXml, { compact: true });
        var oAbapManifest;
        var sapEntries;
        try {
            oAbapManifest = normalize(_.cloneDeep(oAbapXml)['asx:abap']['asx:values']['TRM_MANIFEST']);
            manifest = {
                name: oAbapManifest.name.text,
                version: oAbapManifest.version.text,
                backwardsCompatible: false, //default overwitten later
                private: false, //default overwitten later,
                registry: PUBLIC_RESERVED_KEYWORD //default overwritten later
            };
        } catch (e) {
            throw new Error('XML Manifest is corrupted.');
        }
        try {
            sapEntries = oAbapXml['asx:abap']['asx:values']['TRM_MANIFEST']['SAP_ENTRIES'];
        } catch (e) {
            Logger.error(e.toString(), true);
            Logger.error(`Couldn't parse sapEntries in abap xml manifest`, true);
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
            manifest.registry = oAbapManifest.registry.text;
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
        if (oAbapManifest.replicense && oAbapManifest.replicense.text) {
            manifest.namespace = {
                replicense: oAbapManifest.replicense.text,
                texts: []
            };
            if (oAbapManifest.ns && oAbapManifest.ns.text) {
                manifest.namespace.ns = oAbapManifest.ns.text;
            }
            if (oAbapManifest.replicenseT && oAbapManifest.replicenseT.item) {
                if (Array.isArray(oAbapManifest.replicenseT.item)) {
                    manifest.namespace.texts = oAbapManifest.replicenseT.item.map(o => {
                        return {
                            description: o.description?.text,
                            language: o.language?.text,
                            owner: o.owner?.text
                        };
                    });
                } else {
                    manifest.namespace.texts = [{
                        description: oAbapManifest.replicenseT.item.description?.text,
                        language: oAbapManifest.replicenseT.item.language?.text,
                        owner: oAbapManifest.replicenseT.item.owner?.text
                    }];
                }
            }
        } if (oAbapManifest.keywords && oAbapManifest.keywords.item) {
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
        if (oAbapManifest.dependencies && oAbapManifest.dependencies.item) {
            if (Array.isArray(oAbapManifest.dependencies.item)) {
                manifest.dependencies = oAbapManifest.dependencies.item.map(o => {
                    return {
                        name: o.name?.text,
                        version: o.version?.text,
                        registry: o.registry?.text
                    };
                });
            } else {
                manifest.dependencies = [{
                    name: oAbapManifest.dependencies.item.name?.text,
                    version: oAbapManifest.dependencies.item.version?.text,
                    registry: oAbapManifest.dependencies.item.registry?.text
                }];
            }
        }
        if (sapEntries && sapEntries.item) {
            manifest.sapEntries = {};
            try {
                const aParsedXml = this._parseAbapXmlSapEntriesArray(sapEntries.item);
                aParsedXml.forEach(o => {
                    manifest.sapEntries[o.TABLE] = [];
                    o.ENTRIES.forEach(e => {
                        var parsedEntry = {};
                        Object.keys(e).forEach(field => {
                            var parsedField = field.toUpperCase();
                            parsedEntry[parsedField] = e[field];
                        });
                        if (Object.keys(parsedEntry).length > 0) {
                            manifest.sapEntries[o.TABLE].push(parsedEntry);
                        }
                    });
                });
            } catch (e) { }
        }
        return new Manifest(Manifest.normalize(manifest, false));
    }

    public static _parseAbapXmlSapEntriesArray(input: any): any[] {
        var array = [];
        if (Array.isArray(input)) {
            input.forEach(o => {
                array = array.concat(this._parseAbapXmlSapEntriesArray(o));
            });
        } else {
            var obj = {};
            Object.keys(input).forEach(k => {
                if (input[k]._text) {
                    obj[k] = input[k]._text;
                } else {
                    if (input[k].item) {
                        obj[k] = this._parseAbapXmlSapEntriesArray(input[k].item);
                    }
                }
            });
            array.push(obj);
        }
        return array;
    }

    public static fromJson(sJson: string): Manifest {
        return new Manifest(Manifest.normalize(JSON.parse(sJson), false));
    }

    public static compare(o1: Manifest, o2: Manifest, checkVersion: boolean = false): boolean {
        const s1 = o1.getKey(checkVersion);
        const s2 = o2.getKey(checkVersion);
        return s1 === s2;
    }

    public static stringAuthorsToArray(sAuthors: string): TrmManifestAuthor[] {
        var authors: TrmManifestAuthor[] = [];
        if (sAuthors) {
            sAuthors.split(',').forEach(s => {
                if (s) {
                    const match = s.trim().match(/^(.*?)(?:\s*<([^>]+)>)?$/);
                    if (match && match.length >= 3) {
                        authors.push({
                            name: match[1] ? match[1].trim() : undefined,
                            email: match[2] ? match[2].trim() : undefined
                        });
                    }
                }
            });
        }
        return authors;
    }

    public static stringKeywordsToArray(sKeywords: string): string[] {
        if (sKeywords) {
            return sKeywords.split(',').map(s => {
                if (s) {
                    return s.trim();
                }
            }).filter(k => k !== undefined);
        } else {
            return [];
        }
    }

}