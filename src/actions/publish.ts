import * as semver from "semver";
import { Inquirer } from "../inquirer";
import { validateDevclass, validateTransportTarget } from "../inquirer/validators";
import { Logger } from "../logger";
import { Manifest, TrmManifest } from "../manifest";
import { Registry, RegistryType } from "../registry";
import { DEVCLASS, TR_TARGET } from "../rfc/components";
import { TADIR } from "../rfc/struct";
import { SystemConnector } from "../systemConnector";
import { Transport, TrmTransportIdentifier } from "../transport";
import { DEFAULT_VERSION, TrmPackage } from "../trmPackage";
import { TrmArtifact } from "../trmPackage/TrmArtifact";
import { TadirDependency, findTadirDependencies } from "./findTadirDependencies";
import { parsePackageName } from "../commons";
import { createHash } from "crypto";

async function getTrmPackage(data: {
    manifest: TrmManifest,
    registry: Registry,
    overwriteManifestValues: boolean,
    forceManifestInput: boolean,
    ci: boolean
}, inquirer: Inquirer, logger: Logger) {
    var manifest = data.manifest;
    const ci = data.ci || false;
    const registry = data.registry;
    const overwriteManifestValues = data.overwriteManifestValues;
    const forceManifestInput = data.forceManifestInput;
    const usingLatest = manifest.version.trim().toLowerCase() === 'latest';
    if (!usingLatest) {
        manifest.version = semver.clean(manifest.version);
        if (!manifest.version) {
            throw new Error('Version not supported.');
        }
    }

    //build a dummy TrmPackage
    const trmPackage = new TrmPackage(manifest.name, registry);

    //check allowed to publish
    const alreadyPublished = await trmPackage.exists();
    var latestPublishedVersion: string;
    if (alreadyPublished) {
        if (!await trmPackage.canPublishReleases()) {
            throw new Error(`You are not not authorized to publish "${trmPackage.packageName}" releases.`);
        }
        logger.warning(`A package named "${trmPackage.packageName}" is already pubished in registry "${trmPackage.registry.name}".`);

        const latestPublishedManifest = (await trmPackage.fetchRemoteManifest('latest')).get();
        latestPublishedVersion = semver.clean(latestPublishedManifest.version);

        if (!usingLatest) {
            const versionAllowed = !(await trmPackage.exists(manifest.version));
            if (!versionAllowed) {
                throw new Error(`Package "${trmPackage.packageName}" versioned ${manifest.version} already published.`);
            }
        } else {
            manifest.version = semver.inc(latestPublishedManifest.version, 'patch');
            logger.info(`Latest version used, generated as ${manifest.version}`);
        }


        //copy, when not forced to keep the newer values
        if (!overwriteManifestValues) {
            manifest.description = latestPublishedManifest.description;
            manifest.website = latestPublishedManifest.website;
            manifest.git = latestPublishedManifest.git;
            manifest.authors = latestPublishedManifest.authors;
            manifest.keywords = latestPublishedManifest.keywords;
            manifest.license = latestPublishedManifest.license;
        }
        //merge old dependencies with new
        //this is true only to manually added dependencies
        //for the time being, don't do this
        /*latestPublishedManifest.dependencies.forEach(o => {
            var arrayIndex = manifest.dependencies.findIndex(d => d.name === o.name);
            if (arrayIndex < 0) {
                arrayIndex = manifest.dependencies.push(o);
                arrayIndex--;
            }
            manifest.dependencies[arrayIndex].version = o.version; //make sure to use the newer version
        });*/
    } else {
        logger.info(`First time publishing "${trmPackage.packageName}". Congratulations!`);
        if (usingLatest) {
            manifest.version = DEFAULT_VERSION;
            logger.info(`Latest version used, generated as ${manifest.version}`);
        }
    }

    //normalize (and check one more time) manifest
    manifest = Manifest.normalize(manifest, false);

    if (alreadyPublished) {
        if (ci && typeof (manifest.backwardsCompatible) !== 'boolean') {
            throw new Error('Missing parameter "backwardsCompatible"');
        }
        const inq1 = await inquirer.prompt({
            type: "confirm",
            message: `Is this release backwards compatible with the current latest release ${latestPublishedVersion}?`,
            name: "backwardsCompatible",
            when: !ci,
            default: true
        });
        manifest.backwardsCompatible = manifest.backwardsCompatible || inq1.backwardsCompatible;
    } else {
        manifest.backwardsCompatible = true; //by default to avoid unintentional errors during install, but it means nothing...
    }
    if (ci && typeof (manifest.private) !== 'boolean') {
        throw new Error('Missing parameter "private"');
    }
    const inq2 = await inquirer.prompt([{
        type: "list",
        message: "Package type",
        name: "packageType",
        default: "public",
        choices: [{
            name: "Public (Visible to all users)",
            value: "public"
        }, {
            name: "Private (Visible to you and users in organization, if specified)",
            value: "private"
        }],
        when: !alreadyPublished && !ci
    }]);
    if (!alreadyPublished || forceManifestInput) {
        const inq3 = await inquirer.prompt([{
            type: "input",
            message: "Package short description",
            name: "description",
            default: manifest.description,
            when: !ci
        }, {
            type: "input",
            message: "Website",
            name: "website",
            default: manifest.website,
            when: !ci
        }, {
            type: "input",
            message: "Package Git repository",
            name: "git",
            default: manifest.git,
            when: !ci
        }, {
            type: "input",
            message: "Authors (separated by comma)",
            name: "authors",
            //default: TODO
            when: !ci
        }, {
            type: "input",
            message: "Keywords (separated by comma)",
            name: "keywords",
            //default: TODO
            when: !ci
        }, {
            type: "input",
            message: "License",
            name: "license",
            default: manifest.license,
            when: !ci
        }]);
        manifest.description = manifest.description || inq3.description;
        manifest.website = manifest.website || inq3.website;
        manifest.git = manifest.git || inq3.git;
        manifest.authors = manifest.authors || inq3.authors;
        manifest.keywords = manifest.keywords || inq3.keywords;
        manifest.license = manifest.license || inq3.license;
    }
    if (inq2.packageType) {
        manifest.private = inq2.packageType === 'private';
        if (manifest.private) {
            const parsedName = parsePackageName({
                fullName: manifest.name
            });
            if (!parsedName.organization) {
                logger.warning(`Publishing a private package without a scope, this may not be allowed by the registry.`);
            }
        }
    }


    const oManifest = new Manifest(manifest);
    return new TrmPackage(manifest.name, registry, oManifest);
}

export async function publish(data: {
    package: TrmManifest, //atleast name and version
    devclass?: DEVCLASS,
    target?: TR_TARGET,
    ci?: boolean,
    skipDependencies?: boolean,
    forceManifestInput?: boolean,
    overwriteManifestValues?: boolean,
    skipEditSapEntries?: boolean,
    skipEditDependencies?: boolean,
    skipReadme?: boolean,
    readme?: string,
    releaseTimeout?: number,
    tmpFolder?: string
}, inquirer: Inquirer, system: SystemConnector, registry: Registry, logger: Logger) {
    var manifest = data.package;
    var devclass = data.devclass;
    var trTarget = data.target;
    const ci = data.ci;
    const skipDependencies = data.skipDependencies;
    if (ci) {
        data.forceManifestInput = false;
        data.overwriteManifestValues = true;
        data.skipEditDependencies = true;
        data.skipEditSapEntries = true;
        data.skipReadme = true;
    }
    manifest.name = manifest.name.toLowerCase().trim();
    logger.loading(`Checking package...`);
    manifest.version = await TrmPackage.normalizeVersion(manifest.name, manifest.version, registry);

    //before anything, check on registry if this package can be released
    //create a dummy TrmPackage, just to check if it can be published
    const oDummyTrmPackage = new TrmPackage(manifest.name, registry);
    var publishAllowed = true;
    try {
        publishAllowed = await oDummyTrmPackage.canPublishReleases();
    } catch (e) {
        //if this check gives an error, catch and try to publish anyway -> this might mean package not in registry so we're allowed
        //if it's an actual error, it will appear later on anyway
        //remember to give error code 404 if no package exists but always return the user authorizations
    }
    if (!publishAllowed) {
        throw new Error(`You are not not authorized to publish "${manifest.name}" releases.`);
    } else {
        logger.success(`Package check successful.`);
    }

    if (!devclass) {
        //devclass default value could be provided (if the package already exists in the system)
        //TODO find
        const inq1 = await inquirer.prompt({
            type: "input",
            message: "Package devclass",
            name: "devclass",
            validate: async (input: string) => {
                return await validateDevclass(input, system);
            }
        });
        devclass = inq1.devclass;
    }
    devclass = devclass.trim().toUpperCase();

    const devclassValid = await validateDevclass(devclass, system);
    if (devclassValid && devclassValid !== true) {
        throw new Error(devclassValid);
    }

    const systemTmscsys = await system.getTransportTargets();
    if (!trTarget) {
        const inq2 = await inquirer.prompt({
            type: "list",
            message: "Transport request target",
            name: "trTarget",
            validate: async (input: string) => {
                return await validateTransportTarget(input, systemTmscsys);
            },
            choices: systemTmscsys.map(o => {
                return {
                    name: `${o.sysnam} (${o.systxt})`,
                    value: o.sysnam
                }
            })
        });
        trTarget = inq2.trTarget.trim().toUpperCase();
    } else {
        trTarget = trTarget.trim().toUpperCase();
        const trTargetValid = await validateTransportTarget(trTarget, systemTmscsys);
        if (trTargetValid && trTargetValid !== true) {
            throw new Error(trTargetValid);
        }
    }

    //get all tadir objects
    logger.loading(`Reading package objects...`);
    const allTadir: TADIR[] = await system.getDevclassObjects(devclass, true);

    //find dependencies
    if (!manifest.dependencies) {
        manifest.dependencies = [];
    }
    if (!manifest.sapEntries) {
        manifest.sapEntries = {};
    }
    var tadirDependencies: TadirDependency[] = [];
    if (!skipDependencies) {
        logger.loading(`Searching dependencies...`);
        tadirDependencies = await findTadirDependencies({
            devclass,
            tadir: allTadir
        }, system, logger);
    } else {
        logger.info(`Skipping dependencies.`);
        logger.warning(`Skipping dependencies can cause your package to fail activation. Make sure to manually edit the dependencies if necessary.`);
    }
    var dependenciesError: string;
    tadirDependencies.forEach(d => {
        if (!d.trmPackage) {
            if (d.isSap) {
                if (!manifest.sapEntries['TADIR']) {
                    manifest.sapEntries['TADIR'] = [];
                }
                d.tadir.forEach(t => {
                    var arrayIndex = manifest.sapEntries['TADIR'].findIndex(o => o['PGMID'] === t.pgmid && o['OBJECT'] === t.object && o['OBJ_NAME'] === t.objName);
                    if (arrayIndex < 0) {
                        arrayIndex = manifest.sapEntries['TADIR'].push({
                            "PGMID": t.pgmid,
                            "OBJECT": t.object,
                            "OBJ_NAME": t.objName
                        });
                        arrayIndex--;
                    }
                    //logger.info(`Found dependency with TADIR ${t.pgmid} ${t.object} ${t.objName}`);
                });
            } else {
                dependenciesError = `All objects must be included in a TRM Package in order to continue.`;
                d.tadir.forEach(t => {
                    logger.error(`Object ${t.object} ${t.objName} of devclass ${t.devclass} has no TRM Package.`);
                });
            }
        } else {
            const dependencyManifest = d.trmPackage.manifest.get();
            const dependencyName = dependencyManifest.name;
            const dependencyVersion = `^${dependencyManifest.version}`;
            const dependencyIntegrity = d.integrity;
            const dependencyRegistry = d.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? undefined : d.trmPackage.registry.endpoint;
            var arrayIndex = manifest.dependencies.findIndex(o => o.name === dependencyName);
            if (arrayIndex < 0) {
                arrayIndex = manifest.dependencies.push({
                    name: dependencyName,
                    version: dependencyVersion,
                    integrity: dependencyIntegrity,
                    registry: dependencyRegistry
                });
                arrayIndex--;
            }
            //is this necessary?
            manifest.dependencies[arrayIndex].version = dependencyVersion;
            manifest.dependencies[arrayIndex].integrity = dependencyIntegrity;
            if (Registry.compare(d.trmPackage.registry, registry)) {
                logger.info(`Found dependency with package "${dependencyName}", version "${dependencyVersion}"`);
            } else {
                const dependencyRegistryName = d.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : d.trmPackage.registry.endpoint;
                logger.warning(`Found dependency with package "${dependencyName}", version "${dependencyVersion}", on a "${dependencyRegistryName}" registry!`)
            }
            if (!dependencyIntegrity) {
                dependenciesError = `Dependency "${dependencyName}", package integrity not found.`;
            }
        }
    });
    if (dependenciesError) {
        throw new Error(dependenciesError);
    } else {
        const skipEditSapEntries = data.skipEditSapEntries || false;
        const skipEditDependencies = data.skipEditDependencies || false;

        if (manifest.sapEntries && manifest.sapEntries['TADIR']) {
            logger.info(`This package requires ${manifest.sapEntries['TADIR'].length} SAP objects.`);
        }
        if (manifest.dependencies.length > 0) {
            logger.info(`Found ${manifest.dependencies.length} dependencies.`);
        } else {
            logger.info(`No dependencies with TRM packages found.`);
        }
        const inq3 = await inquirer.prompt([{
            message: `Manually edit required SAP entries? (MIGHT NEED ENTER TWICE)`,
            type: 'confirm',
            name: 'editSapEntries',
            default: false,
            when: !skipEditSapEntries
        }, {
            message: 'Edit SAP entries',
            type: 'editor',
            name: 'sapEntries',
            postfix: '.json',
            when: (hash) => {
                return hash.editSapEntries
            },
            default: manifest.sapEntries ? JSON.stringify(manifest.sapEntries, null, 2) : '{}',
            validate: (input) => {
                try {
                    JSON.parse(input);
                    return true;
                } catch (e) {
                    return 'Invalid JSON';
                }
            }
        }]);
        const inq4 = await inquirer.prompt([{
            message: `Manually edit dependencies? ${skipEditSapEntries ? '(MIGHT NEED ENTER TWICE)' : ''}`,
            type: 'confirm',
            name: 'editDependencies',
            default: false,
            when: !skipEditDependencies
        }, {
            message: 'Editor dependencies',
            type: 'editor',
            name: 'dependencies',
            postfix: '.json',
            when: (hash) => {
                return hash.editDependencies
            },
            default: manifest.dependencies ? JSON.stringify(manifest.dependencies, null, 2) : '[]',
            validate: (input) => {
                try {
                    JSON.parse(input);
                    return true;
                } catch (e) {
                    return 'Invalid JSON';
                }
            }
        }]);
        if (inq3.sapEntries) {
            manifest.sapEntries = JSON.parse(inq3.sapEntries);
        } else {
            manifest.sapEntries = manifest.sapEntries || {};
        }
        if (inq4.dependencies) {
            manifest.dependencies = JSON.parse(inq4.dependencies);
        } else {
            manifest.dependencies = manifest.dependencies || [];
        }
    }

    //generate TrmPackage
    const oTrmPackage = await getTrmPackage({
        manifest,
        registry,
        overwriteManifestValues: data.overwriteManifestValues,
        forceManifestInput: data.forceManifestInput,
        ci
    }, inquirer, logger);
    const sManifestXml = oTrmPackage.manifest.getAbapXml();

    const skipReadme = data.skipReadme || false;
    var readme = data.readme;
    const inq4 = await inquirer.prompt([{
        message: 'Write readme?',
        type: 'confirm',
        name: 'editReadme',
        default: false,
        when: !skipReadme
    }, {
        message: 'Write readme',
        type: 'editor',
        name: 'readme',
        postfix: '.md',
        when: (hash) => {
            return hash.editReadme
        },
        default: readme || ''
    }]);
    if (inq4.readme) {
        readme = inq4.readme;
    } else {
        readme = readme || '';
    }

    //generate transports
    //1. type TADIR -> include all objects of devclass and objects of all subpackages
    //2. type DEVC -> include DEVC objects only
    var rollBackTransports = false;
    const objectsOnly: TADIR[] = allTadir.filter(o => !(o.pgmid === 'R3TR' && o.object === 'DEVC'));
    const devcOnly: TADIR[] = allTadir.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC');

    logger.loading(`Generating transports...`);
    const devcToc: Transport = await Transport.createToc({
        trmIdentifier: TrmTransportIdentifier.DEVC,
        target: trTarget,
        text: `@X1@TRM: ${manifest.name} v${manifest.version} (D)`
    }, system, true, logger);
    const tadirToc: Transport = await Transport.createToc({
        trmIdentifier: TrmTransportIdentifier.TADIR,
        target: trTarget,
        text: `@X1@TRM: ${manifest.name} v${manifest.version}`
    }, system, true, logger);

    try {
        await tadirToc.addComment(`name=${manifest.name}`);
        await tadirToc.addComment(`version=${manifest.version}`);
        await tadirToc.setDocumentation(sManifestXml);
        await tadirToc.addObjects(objectsOnly, false);
        await devcToc.addObjects(devcOnly, false);
    } catch (e) {
        rollBackTransports = true;
        throw e;
    } finally {
        if (rollBackTransports) {
            //transport without locks, deleting should not give extra errors
            await tadirToc.delete();
            await devcToc.delete();
        }
    }

    const timeout = data.releaseTimeout || 180;
    const tmpFolder = data.tmpFolder;
    var devcTocReleased = false; //TODO make a better method inside Transport

    try {
        logger.forceStop();
        await tadirToc.release(false, false, tmpFolder, timeout);
        logger.loading(`Finalizing release...`);
        await devcToc.release(false, true, tmpFolder, timeout);
        devcTocReleased = true;

        logger.loading(`Creating TRM Artifact...`);
        const trmArtifact = await TrmArtifact.create([
            tadirToc,
            devcToc
        ], oTrmPackage.manifest, true);

        logger.loading(`Publishing...`);
        await oTrmPackage.publish({
            artifact: trmArtifact,
            packageName: oTrmPackage.manifest.get().name,
            packageVersion: oTrmPackage.manifest.get().version,
            readme
        });
        //add to publish trkorr
        await system.addToSrcTrkorr(tadirToc.trkorr);
        //set integrity
        if (process.env.TRM_ENV === 'DEV') {
            rollBackTransports = true;
        } else {
            //generate integrity
            const integrity = createHash("sha512").update(trmArtifact.binary).digest("hex");
            await system.rfcClient.setPackageIntegrity({
                package_name: oTrmPackage.manifest.get().name,
                package_registry: oTrmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : oTrmPackage.registry.endpoint,
                integrity
            });
        }
        logger.success(`+ ${oTrmPackage.manifest.get().name} v${oTrmPackage.manifest.get().version}`);
    } catch (e) {
        //rollBackTransports = e['trkorrRollback'] ? true : false;
        rollBackTransports = true;
        throw e;
    } finally {
        if (rollBackTransports) {
            await system.addToIgnoredTrkorr(tadirToc.trkorr);
            logger.error(`Transport ${tadirToc.trkorr} rollback.`);
            if (!devcTocReleased) {
                await devcToc.delete();
                logger.error(`Transport ${devcToc.trkorr} rollback.`);
            }
        }
    }
}