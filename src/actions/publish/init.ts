import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { getPackageNamespace, parsePackageName } from "../../commons";
import { TrmPackage } from "../../trmPackage";
import { clean, inc, parse, prerelease, rcompare, valid } from "semver";
import { SystemConnector } from "../../systemConnector";
import { RegistryPackageNotFoundError, RegistryType } from "../../registry";
import chalk from "chalk";
import { setTransportTarget } from "../commons/prompts";
import { validateDevclass } from "../../validators";
import { DotAbapGit } from "../../abapgit";
import { minimatch } from "minimatch";

function nextPrerelease(version: string, identifier?: string): string | null {
    const pre = prerelease(version);
    const currentId = pre && typeof pre[0] === "string" ? String(pre[0]) : undefined;

    if (identifier) {
        return pre && currentId === identifier
            ? inc(version, "prerelease", identifier)
            : `${valid(version)}-${identifier}.0`;
    } else {
        return inc(version, "prerelease", currentId);
    }
}

function getHighestPrerelease(versions: string[], baseVersion: string, identifier?: string): string | null {
    const base = parse(baseVersion);

    const filtered = versions.filter((v) => {
        const parsed = parse(clean(v) || v, { loose: true });
        if (!parsed) return false;

        const pre = prerelease(parsed.version);
        if (!pre) return false;

        const vBase = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
        if (vBase !== `${base.major}.${base.minor}.${base.patch}`) return false;

        return identifier
            ? pre[0] === identifier
            : typeof pre[0] === "number" || pre.length === 1; // numeric-only
    });

    if (filtered.length === 0) return null;

    return filtered.sort(rcompare)[0];
}

/**
 * Workflow step that validates release metadata and reads the source ABAP package.
 * 
 * 1- fill context data
 * 
 * 2- validate/clean package name/version
 * 
 * 3- check publish authorization (if public registry)
 * 
 * 4- ensure package version and visibility can be published
 * 
 * 5- set visibility if not already provided
 * 
 * 6- validate minimum publish data with registry
 * 
 * 7- set sap package
 * 
 * 8- read namespace
 * 
 * 9- read abapGit source code (if abapgit installed)
 * 
 * 10- remove gitignore objects (if abapgit installed)
 * 
 * 11- check for locks
 * 
 * 12- check/set system target
 * 
*/
export const init: Step<PublishWorkflowContext> = {
    name: 'init',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        //1- fill context data
        context.runtime = {
            latest: {
                data: undefined
            },
            sapPackage: {
                objects: [],
                namespace: undefined
            },
            abapGit: {
                dotAbapGit: undefined,
                sourceCode: undefined,
                object: [],
                excludedObjects: []
            },
            manifest: {
                ...context.rawInput.packageData.manifest,
                name: undefined,
                version: undefined,
                authors: Array.isArray(context.rawInput.packageData.manifest.authors)
                    ? [...context.rawInput.packageData.manifest.authors]
                    : context.rawInput.packageData.manifest.authors,
                dependencies: [...context.rawInput.packageData.manifest.dependencies],
                keywords: Array.isArray(context.rawInput.packageData.manifest.keywords)
                    ? [...context.rawInput.packageData.manifest.keywords]
                    : context.rawInput.packageData.manifest.keywords,
                postActivities: [...context.rawInput.packageData.manifest.postActivities],
                sapEntries: { ...context.rawInput.packageData.manifest.sapEntries }
            },
            manifestXml: undefined,
            customizing: {
                retained: [],
                new: []
            },
            transports: {
                devc: undefined,
                tadir: undefined,
                lang: undefined,
                cust: []
            },
            aggregatedTransports: [],
            stopWarningShown: false
        }
        context.output = {
            trmArtifact: undefined,
            trmPackage: undefined
        }

        //2- validate/clean package name/version
        context.rawInput.packageData.name = parsePackageName({
            fullName: context.rawInput.packageData.name
        }).fullName;
        context.rawInput.packageData.version = clean(context.rawInput.packageData.version || '');

        //3- check publish authorization (if public registry)
        if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC) {
            Logger.loading(`Checking publish authorization...`);
            try {
                await context.rawInput.packageData.registry.whoAmI();
            } catch (e) {
                Logger.error(`Cannot publish to public registry without being logged in!`);
                throw e;
            }
        }

        //4- ensure package version and visibility can be published
        //if it's the first package publish assume it's valid (validate publish will throw error later, in case something is wrong with it)
        //default to 1.0.0 if no version was provided
        //if the package already exists, check this version was not released yet
        //if it's public registry, check visibility is not changed too (avoid useless validate publish call)
        //in all cases, calculate the next prerelease if requested
        //on automatic version, manual validation by user
        Logger.loading(`Validating version...`);
        var automaticVersion: boolean = false;
        try {
            context.runtime.latest.data = await context.rawInput.packageData.registry.getPackage(context.rawInput.packageData.name, 'latest');
        } catch (e) {
            if (e instanceof RegistryPackageNotFoundError) {
                Logger.info(`First time publishing "${context.rawInput.packageData.name}". Congratulations!`, context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL);
            } else {
                throw e;
            }
        }
        if (context.runtime.latest.data) {
            if (!context.runtime.latest.data.dist_tags.latest) {
                throw new Error(`Package has no latest distribution tag assigned! Unable to locate latest release.`);
            }
            if (!context.rawInput.packageData.version || !valid(context.rawInput.packageData.version)) {
                context.rawInput.packageData.version = inc(context.runtime.latest.data.dist_tags.latest, context.rawInput.packageData.inc || "patch");
                automaticVersion = true;
            } else {
                if (context.runtime.latest.data.versions.concat(context.runtime.latest.data.yanked_versions).includes(context.rawInput.packageData.version)) {
                    throw new Error(`Version "${context.rawInput.packageData.version}" already published.`);
                }
                if (context.rawInput.packageData.preRelease) {
                    const highestPreRelease = getHighestPrerelease(context.runtime.latest.data.versions.concat(context.runtime.latest.data.yanked_versions), context.rawInput.packageData.version, context.rawInput.packageData.preReleaseIdentifier);
                    if (highestPreRelease) {
                        context.rawInput.packageData.version = highestPreRelease;
                        automaticVersion = true;
                    }
                    context.rawInput.packageData.version = nextPrerelease(context.rawInput.packageData.version, context.rawInput.packageData.preReleaseIdentifier);
                }
            }
            if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC) {
                Logger.log(`Public registry, checking if visibility is the same as latest release`, true);
                if (typeof (context.rawInput.publishData.private) === 'boolean' && context.rawInput.publishData.private !== context.runtime.latest.data.manifest.private) {
                    throw new Error(`Cannot change package visibility from ${context.runtime.latest.data.manifest.private ? 'private' : 'public'} to ${context.rawInput.publishData.private ? 'private' : 'public'}`);
                }
            }
        } else {
            if (!context.rawInput.packageData.version || !valid(context.rawInput.packageData.version)) {
                context.rawInput.packageData.version = '1.0.0';
                automaticVersion = true;
            }
            if (context.rawInput.packageData.preRelease) {
                context.rawInput.packageData.version = nextPrerelease(context.rawInput.packageData.version, context.rawInput.packageData.preReleaseIdentifier);
            }
        }

        if (automaticVersion) {
            Logger.info(`Automatically set publish version to "${context.rawInput.packageData.version}"`);
            if (!context.rawInput.contextData.noInquirer) {
                context.rawInput.packageData.version = (await Inquirer.prompt([{
                    type: 'confirm',
                    message: `Continue publish as version "${context.rawInput.packageData.version}"?`,
                    default: true,
                    name: 'acceptDefaultVersion'
                }, {
                    type: 'input',
                    message: `Release version`,
                    name: 'version',
                    default: context.rawInput.packageData.version,
                    when: (hash) => {
                        return !hash.acceptDefaultVersion;
                    },
                    validate: (v) => {
                        if (valid(v)) {
                            const publishedVersions = context.runtime.latest.data
                                ? context.runtime.latest.data.versions.concat(context.runtime.latest.data.yanked_versions)
                                : [];
                            if (publishedVersions.includes(v)) {
                                return `Version "${v}" is already published.`;
                            } else {
                                return true;
                            }
                        } else {
                            return `Invalid version`;
                        }
                    }
                }])).version || context.rawInput.packageData.version;
            }
        }

        //5- set visibility if not already provided
        var isPrivate: boolean | undefined = undefined;
        if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL) {
            isPrivate = true;
        } else {
            isPrivate = context.rawInput.publishData.private === undefined ? (context.runtime.latest.data ? context.runtime.latest.data.manifest.private : undefined) : context.rawInput.publishData.private;
            if (isPrivate === undefined) {
                if (context.rawInput.contextData.noInquirer) {
                    throw new Error(`publishData.private is required for the first remote publication when interactive prompts are disabled.`);
                }
                isPrivate = (await Inquirer.prompt({
                    type: "list",
                    message: "Package visibility",
                    name: "private",
                    default: true,
                    choices: [{
                        name: `Public`,
                        value: false
                    }, {
                        name: `Private`,
                        value: true
                    }]
                })).private;
            }
        }

        //6- validate minimum publish data with registry
        //this is the bare minimum: if it fails there is no need to continue with publish
        Logger.loading(`Validating...`);
        await context.rawInput.packageData.registry.validatePublish(context.rawInput.packageData.name, context.rawInput.packageData.version, isPrivate);

        //7- set sap package
        var packageNeedsValidation: boolean = false;
        if (!context.rawInput.packageData.devclass) {
            const trmPackage = context.rawInput.contextData.systemPackages.find(o => TrmPackage.compare(o, new TrmPackage(context.rawInput.packageData.name, context.rawInput.packageData.registry)));
            if (trmPackage) {
                context.rawInput.packageData.devclass = trmPackage.getDevclass();
            }

            if (!context.rawInput.contextData.noInquirer) {
                context.rawInput.packageData.devclass = (await Inquirer.prompt({
                    type: 'input',
                    message: 'ABAP package',
                    name: 'devclass',
                    default: context.rawInput.packageData.devclass,
                    validate: async (input: string) => {
                        return await validateDevclass(input, false);
                    }
                })).devclass.trim().toUpperCase();
                Logger.log(`Publish devclass set to "${context.rawInput.packageData.devclass}"`, true);
            }
        } else {
            packageNeedsValidation = true;
        }

        if (packageNeedsValidation) {
            Logger.loading(`Validating...`);
            const validate = await validateDevclass(context.rawInput.packageData.devclass, false);
            if (validate && validate !== true) {
                throw new Error(validate);
            }
            Logger.info(`ABAP package: "${context.rawInput.packageData.devclass}"`);
        }

        //8- read namespace
        const packageNamespace = getPackageNamespace(context.rawInput.packageData.devclass);
        if (packageNamespace[0] === '/') {
            Logger.loading(`Validating...`);
            const namespace = await SystemConnector.getNamespace(packageNamespace);
            if (namespace && namespace.trnspacet && namespace.trnspacett.length > 0) {
                context.runtime.sapPackage.namespace = {
                    trnspacet: namespace.trnspacet,
                    trnspacett: namespace.trnspacett
                };
            } else {
                throw new Error(`Namespace ${packageNamespace} couldn't be validated.`);
            }
        }

        context.runtime.sapPackage.objects = await SystemConnector.getDevclassObjects(context.rawInput.packageData.devclass, true);
        if (context.runtime.sapPackage.objects.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC')).length === 0) {
            throw new Error(`ABAP package "${context.rawInput.packageData.devclass}" doesn't contain any object!`);
        }

        //9- read abapGit source code (if abapgit installed)
        //this step is right at the beginning to ensure locks
        //unfortunately, we have to read the whole source code to figure out the objects path, and evetually ignore gitignored objects
        //so it's mandatory to do this before checking for locks :(
        try {
            const sourceCode = await SystemConnector.getAbapgitSource(context.rawInput.packageData.devclass);
            context.runtime.abapGit.sourceCode = sourceCode.zip;
            context.runtime.abapGit.object = sourceCode.objects;
        } catch {
            Logger.log(`Couldn't read source code!`, true);
        }

        //10- remove gitignore objects (if abapgit installed)
        if (context.runtime.abapGit.sourceCode && context.runtime.abapGit.object.length > 0) {
            try {
                context.runtime.abapGit.dotAbapGit = await DotAbapGit.fromDevclass(context.rawInput.packageData.devclass);
            } catch {
                Logger.log(`.abapgit.xml not found`, true);
            }
            if (context.runtime.abapGit.dotAbapGit) {
                const ignoredPatterns = context.runtime.abapGit.dotAbapGit.getIgnoredFiles();
                context.runtime.sapPackage.objects.forEach(o => {
                    const abapgitObject = context.runtime.abapGit.object.find(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName);
                    if (abapgitObject) {
                        ignoredPatterns.forEach(pattern => {
                            if (minimatch(abapgitObject.fullPath, pattern, { matchBase: true })) {
                                if(o.pgmid === 'R3TR' && o.object === 'DEVC'){
                                    throw new Error(`Cannot exclude ABAP package "${o.objName}" (.abapGit.xml)!`);
                                }
                                if (!context.runtime.abapGit.excludedObjects.find(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName)) {
                                    context.runtime.abapGit.excludedObjects.push(o);
                                    context.runtime.sapPackage.objects = context.runtime.sapPackage.objects.filter(k =>
                                        !(k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName)
                                    );
                                }
                            }
                        });
                    }
                });
            }
        }
        //check that after gitignore there are still objects
        if (context.runtime.sapPackage.objects.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC')).length === 0) {
            //no more objects, print what was excluded from gitignore
            context.runtime.abapGit.excludedObjects.forEach(o => Logger.info(`Excluding ${o.pgmid} ${o.object} ${o.objName} (.abapgit gitignore)`));
            throw new Error(`ABAP package "${context.rawInput.packageData.devclass}" doesn't contain any object!`);
        }

        //11- check for locks
        //finally, with excluded objects from gitignore, we can check for locks before continuing
        const locks = await SystemConnector.getObjectsLocks(context.runtime.sapPackage.objects.map(o => {
            return {
                PGMID: o.pgmid,
                OBJECT: o.object,
                OBJ_NAME: o.objName
            };
        }));
        if (locks.length > 0) {
            locks.forEach(l => { Logger.error(`${l.pgmid} ${l.object} ${l.objName} is currently locked in transport ${l.trkorr}`) });
            throw new Error(`To continue, all objects must be released.`);
        } else {
            Logger.log(`All objects released, continue`, true);
        }

        //12- check/set system target
        Logger.loading(`Checking system target...`);
        context.rawInput.systemData.transportTarget = await setTransportTarget(
            context.rawInput.contextData.noInquirer,
            await SystemConnector.getTransportTargets(),
            context.rawInput.systemData.transportTarget,
            "Publish transport target"
        );

        Logger.info(`Ready to publish ${context.rawInput.packageData.name} v${context.rawInput.packageData.version}`);
        Logger.info(`Package visibility: ${chalk.bold(isPrivate ? 'private' : 'public')}`);
        //this is the right time to show the excluded objects
        context.runtime.abapGit.excludedObjects.forEach(o => Logger.info(`Excluding ${o.pgmid} ${o.object} ${o.objName} (.abapgit gitignore)`));

        context.runtime.manifest.name = context.rawInput.packageData.name;
        context.runtime.manifest.version = context.rawInput.packageData.version;
        context.runtime.manifest.private = isPrivate;
    }
}
