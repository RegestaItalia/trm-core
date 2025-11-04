import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { parsePackageName } from "../../commons";
import { TrmPackage } from "../../trmPackage";
import { clean, inc, parse, prerelease, rcompare, valid } from "semver";
import { SystemConnector } from "../../systemConnector";
import { RegistryType } from "../../registry";
import { Transport } from "../../transport";
import { TrmManifest } from "../../manifest";
import chalk from "chalk";

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
 * Init
 * 
 * 1- check package name is compliant
 *  
 * 2- fill missing context/input data
 *  
 * 3- validate version
 * 
 * 4- validate publish data
 * 
 * 5- set runtime data
 * 
*/
export const init: Step<PublishWorkflowContext> = {
    name: 'init',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);
        const registry = context.rawInput.packageData.registry;

        //1- check package name is compliant
        const parsedPackageName = parsePackageName({
            fullName: context.rawInput.packageData.name
        });
        context.rawInput.packageData.name = parsedPackageName.fullName;


        if (registry.getRegistryType() === RegistryType.PUBLIC) {
            Logger.log(`Public registry, checking if logged in`, true);
            await registry.whoAmI();
        }

        //2- fill missing context/input data
        if (!context.rawInput.contextData) {
            context.rawInput.contextData = {}
        }
        if (!context.rawInput.systemData) {
            context.rawInput.systemData = {
                releaseTimeout: 180
            }
        }
        if (!context.rawInput.publishData) {
            context.rawInput.publishData = {
                keepLatestReleaseManifestValues: true,
                customizingTransports: []
            };
        }
        if (context.rawInput.packageData.manifest === undefined) {
            context.rawInput.packageData.manifest = {};
        }
        if (!context.rawInput.packageData.manifest.authors) {
            context.rawInput.packageData.manifest.authors = [];
        }
        if (!context.rawInput.packageData.manifest.dependencies) {
            context.rawInput.packageData.manifest.dependencies = [];
        }
        if (!context.rawInput.packageData.manifest.keywords) {
            context.rawInput.packageData.manifest.keywords = [];
        }
        if (context.rawInput.packageData.manifest.sapEntries === undefined) {
            context.rawInput.packageData.manifest.sapEntries = {};
        }
        if (!context.rawInput.packageData.manifest.postActivities) {
            context.rawInput.packageData.manifest.postActivities = [];
        }
        if (typeof (context.rawInput.publishData.customizingTransports) === 'string') {
            context.rawInput.publishData.customizingTransports = context.rawInput.publishData.customizingTransports.split(',').map(o => {
                try {
                    return new Transport(o.trim());
                } catch (e) {
                    throw new Error(`Invalid customizing transport values: trkorr.`);
                }
            });
        }
        if (!context.rawInput.packageData.tags) {
            context.rawInput.packageData.tags = [];
        }

        //3- validate version
        Logger.loading(`Validating version...`);
        var automaticVersion: boolean = false;
        var releasesInRegistry: string[];
        var latestReleaseManifest: TrmManifest;
        context.rawInput.packageData.version = clean(context.rawInput.packageData.version || '');
        try {
            Logger.loading(`Getting package latest release from registry...`, true);
            const packageData = await registry.getPackage(context.rawInput.packageData.name, 'latest');
            latestReleaseManifest = packageData.manifest;
            releasesInRegistry = packageData.versions;
        } catch { }
        if (!latestReleaseManifest) {
            //first time publish
            if (!context.rawInput.packageData.version || !valid(context.rawInput.packageData.version)) {
                context.rawInput.packageData.version = '1.0.0';
                automaticVersion = true;
            }
            if (context.rawInput.packageData.preRelease) {
                context.rawInput.packageData.version = nextPrerelease(context.rawInput.packageData.version, context.rawInput.packageData.preReleaseIdentifier);
            }
        } else {
            if (!context.rawInput.packageData.version || !valid(context.rawInput.packageData.version)) {
                context.rawInput.packageData.version = inc(latestReleaseManifest.version, context.rawInput.packageData.inc || "patch");
                automaticVersion = true;
            } else {
                if (releasesInRegistry.includes(context.rawInput.packageData.version)) {
                    throw new Error(`Version "${context.rawInput.packageData.version}" already published.`);
                }
                if (context.rawInput.packageData.preRelease) {
                    const highestPreRelease = getHighestPrerelease(releasesInRegistry, context.rawInput.packageData.version, context.rawInput.packageData.preReleaseIdentifier);
                    if(highestPreRelease){
                        context.rawInput.packageData.version = highestPreRelease;
                        automaticVersion = true;
                    }
                    context.rawInput.packageData.version = nextPrerelease(context.rawInput.packageData.version, context.rawInput.packageData.preReleaseIdentifier);
                }
            }
            if (registry.getRegistryType() === RegistryType.PUBLIC) {
                Logger.log(`Public registry, checking if visibility is the same as latest release`, true);
                if (typeof (context.rawInput.publishData.private) === 'boolean' && context.rawInput.publishData.private !== latestReleaseManifest.private) {
                    throw new Error(`Cannot change package visibility to ${context.rawInput.publishData.private ? 'private' : 'public'}`);
                }
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
                    message: `Input publish version`,
                    name: 'version',
                    default: context.rawInput.packageData.version,
                    when: (hash) => {
                        return !hash.acceptDefaultVersion;
                    },
                    validate: (v) => {
                        if (valid(v)) {
                            if (releasesInRegistry.includes(v)) {
                                return `Version "${v}" already published.`;
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

        var isPrivate;
        if (registry.getRegistryType() === RegistryType.LOCAL) {
            isPrivate = true;
        } else {
            isPrivate = typeof (context.rawInput.publishData.private) === 'undefined' ? (latestReleaseManifest ? latestReleaseManifest.private : undefined) : context.rawInput.publishData.private;
            if (typeof (isPrivate) === 'undefined') {
                isPrivate = (await Inquirer.prompt({
                    type: "list",
                    message: "Package visibility",
                    name: "private",
                    default: isPrivate,
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

        //4- validate publish data
        Logger.loading(`Validating data...`);
        await registry.validatePublish(context.rawInput.packageData.name, context.rawInput.packageData.version, isPrivate);
        if (!latestReleaseManifest) {
            Logger.info(`First time publishing "${context.rawInput.packageData.name}". Congratulations!`, registry.getRegistryType() === RegistryType.LOCAL);
        }
        Logger.info(`Ready to publish ${context.rawInput.packageData.name} v${context.rawInput.packageData.version}`);
        Logger.info(`Package visibility: ${chalk.bold(isPrivate ? 'private' : 'public')}`);

        //5- set runtime data
        context.runtime = {
            trmPackage: {
                package: new TrmPackage(context.rawInput.packageData.name, registry),
                registry,
                latestReleaseManifest,
                releasesInRegistry,
                manifest: {
                    ...context.rawInput.packageData.manifest,
                    ...{
                        name: context.rawInput.packageData.name,
                        version: context.rawInput.packageData.version,
                        private: isPrivate
                    }
                }
            },
            systemData: {
                transportTargets: [],
                devcTransport: undefined,
                tadirTransport: undefined,
                releasedTransports: []
            },
            packageData: {
                tadir: []
            },
            abapGitData: {
                dotAbapGit: undefined,
                sourceCode: {
                    ignoredObjects: [],
                    zip: undefined
                }
            }
        };
        Logger.loading(`Reading ${SystemConnector.getDest()} transport targets...`);
        context.runtime.systemData.transportTargets = (await SystemConnector.getTransportTargets()).sort((a, b) => {
            if (a.systyp === 'V') {
                return -1;
            } else if (b.systyp === 'V') {
                return 1;
            } else {
                return 0;
            }
        });
        if (context.rawInput.publishData.skipCustomizingTransports) {
            context.rawInput.publishData.customizingTransports = [];
        }
    }
}