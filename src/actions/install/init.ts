import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector, TRM_REST_PACKAGE_NAME, TRM_SERVER_PACKAGE_NAME } from "../../systemConnector";
import { RegistryType } from "../../registry";
import { eq, gt, lt, valid } from "semver";
import { Manifest } from "../../manifest";
import chalk from "chalk";
import { setLandscapeTarget } from "../commons/prompts";
import { logDirtyEntries, resolveInstallPackage, TRM_SERVER_API_VERSION, withoutOwnTrmTransports } from "../commons/utils";
import { RootLock } from "../../lockfile";

function sameName(a: string, b: string): boolean {
    return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * Fills the requested release from the lockfile root, before it is fetched: the root version when
 * none is requested and the root integrity when none is expected.
 * @throws When the package, the requested version, or the expected integrity conflicts with the lockfile root.
 */
function applyRootLock(context: InstallWorkflowContext, rootLock: RootLock): void {
    const packageData = context.rawInput.packageData;
    //the name of a local artifact is only known once it's read
    if (packageData.registry.getRegistryType() !== RegistryType.LOCAL && !sameName(packageData.name, rootLock.name)) {
        throw new Error(`Lockfile is for package "${rootLock.name}", cannot install "${packageData.name}" with it.`);
    }
    if (!packageData.version) {
        packageData.version = rootLock.version;
        Logger.info(`Using ${rootLock.name} v${rootLock.version} from lockfile.`);
    } else if (valid(packageData.version) && !eq(packageData.version, rootLock.version)) {
        throw new Error(`Requested version ${packageData.version} conflicts with lockfile version ${rootLock.version} of "${rootLock.name}". Omit the version or regenerate the lockfile.`);
    }
    if (rootLock.integrity) {
        if (packageData.integrity === undefined) {
            packageData.integrity = rootLock.integrity;
        } else if (packageData.integrity !== rootLock.integrity) {
            throw new Error(`Requested integrity conflicts with lockfile integrity of "${rootLock.name}" v${rootLock.version}.`);
        }
    }
}

/**
 * Checks the fetched release against the lockfile root: a distribution tag or a local artifact
 * may resolve to another package, release, or registry.
 * @throws When the fetched release is not the lockfile root.
 */
async function checkRootLock(context: InstallWorkflowContext, rootLock: RootLock): Promise<void> {
    const manifest = context.runtime.package.data.manifest;
    if (!sameName(manifest.name, rootLock.name)) {
        throw new Error(`Lockfile is for package "${rootLock.name}", cannot install "${manifest.name}" with it.`);
    }
    if (!valid(manifest.version) || !eq(manifest.version, rootLock.version)) {
        throw new Error(`Release "${manifest.name}" v${manifest.version} (${context.rawInput.packageData.version}) conflicts with lockfile version ${rootLock.version}. Omit the version or regenerate the lockfile.`);
    }
    if (rootLock.registry) {
        const installRegistry = (await resolveInstallPackage(context.rawInput.packageData.registry, manifest.name)).registry;
        if (installRegistry.getRegistryType() !== RegistryType.LOCAL && installRegistry.endpoint.trim().toLowerCase() !== rootLock.registry.trim().toLowerCase()) {
            throw new Error(`Lockfile is for package "${rootLock.name}" of registry "${rootLock.registry}", cannot install it from registry "${installRegistry.endpoint}".`);
        }
    }
}

/**
 * Workflow step that fetches the release, validates install settings, and initializes rollback state.
 * 
 * 1- fill context data
 * 
 * 2- fill missing input data
 * 
 * 3- check install transport layer
 * 
 * 4- check/set system target
 * 
 * 5- check if already installed
 * 
*/
export const init: Step<InstallWorkflowContext> = {
    name: 'init',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const registry = context.rawInput.packageData.registry;

        //1- fill context data
        context.runtime = {
            isTrmRest: false,
            isTrmServer: false,
            isLocal: registry.getRegistryType() === RegistryType.LOCAL,
            update: undefined, //if has value, it's the package from system that we're updating
            package: {
                data: undefined,
                hierarchy: undefined
            },
            transports: {
                devc: undefined,
                tadir: undefined,
                lang: undefined,
                cust: []
            },
            dele: undefined,
            transportEntries: {
                tdevct: []
            },
            dependencies: [],
            namespace: undefined, //will be calculated from either origin devclass or target devclass later
            installRegistry: undefined,
            previousInstallPackages: [],
            previousInstallTransports: [],
            dependencyRollbacks: [],
            dependencyReleases: [],
            installedDependencies: [],
            stopWarningShown: false
        };
        context.output = {
            manifest: undefined,
            transport: undefined
        };
        context.revert = {
            cleanupTransport: undefined,
            cleanupImported: false,
            cleanupSucceeded: false,
            importStarted: false,
            importedEntries: [],
            importedCustomizing: [],
            packageHierarchy: [],
            packageTransportLayers: [],
            createdTransports: { cust: [] },
            sapPackages: [],
            dele: undefined,
            metadataWriteStarted: false,
            metadataPackageRegistry: undefined,
            metadataPackageRow: undefined,
            metadataPreviousPackageRow: undefined,
            namespace: undefined
        };

        //the lockfile root pins the release (and its integrity) of the package being installed
        const rootLock = context.rawInput.dependency ? undefined : context.rawInput.installData?.checks?.lockfile?.getRootLock();
        if (rootLock) {
            applyRootLock(context, rootLock);
        }

        Logger.loading(`Fetching package in registry ${registry.name}...`);
        context.runtime.package.data = await registry.getPackage(context.rawInput.packageData.name, context.rawInput.packageData.version || 'latest');
        context.output.manifest = context.runtime.package.data.manifest;

        if (rootLock) {
            await checkRootLock(context, rootLock);
        }

        //the release whose transports are imported must be the expected one (e.g. locked)
        const expectedIntegrity = context.rawInput.packageData.integrity;
        if (expectedIntegrity !== undefined && context.runtime.package.data.checksum !== expectedIntegrity) {
            Logger.error(`SECURITY ISSUE! Release "${context.rawInput.packageData.name}", registry "${registry.name}", integrity does NOT match!`, { important: true });
            Logger.error(`SECURITY ISSUE! Registry SHA is ${context.runtime.package.data.checksum}`, { important: true });
            Logger.error(`SECURITY ISSUE! Expected SHA is ${expectedIntegrity}`, { important: true });
            throw new Error(`Cannot continue due to security issues.`);
        }

        //only used to validate manifest
        try {
            Manifest.normalize(context.runtime.package.data.manifest);
        } catch (e) {
            throw new Error(`Package manifest is invalid: ${e.toString()}`);
        }


        // replace input name with actual name in manifest: install mappings and transports
        // are read and written with case-sensitive queries, under the name of the package record
        context.rawInput.packageData.name = context.runtime.package.data.manifest.name;
        //install mappings, transports and locks are recorded under the real registry of a local artifact
        context.runtime.installRegistry = (await resolveInstallPackage(registry, context.rawInput.packageData.name)).registry;

        context.runtime.isTrmServer = context.runtime.package.data.name === TRM_SERVER_PACKAGE_NAME && registry.getRegistryType() === RegistryType.PUBLIC;
        context.runtime.isTrmRest = context.runtime.package.data.name === TRM_REST_PACKAGE_NAME && registry.getRegistryType() === RegistryType.PUBLIC;

        //2- fill missing input data
        if (context.rawInput.packageData.overwrite === undefined) {
            context.rawInput.packageData.overwrite = false;
        }
        if (!context.rawInput.installData) {
            context.rawInput.installData = {};
        }
        if (!context.rawInput.installData.checks) {
            context.rawInput.installData.checks = {};
        }
        if (!context.rawInput.installData.import) {
            context.rawInput.installData.import = {};
        }
        if (!context.rawInput.installData.installDevclass) {
            context.rawInput.installData.installDevclass = {};
        }
        if (!context.rawInput.installData.installDevclass.replacements) {
            context.rawInput.installData.installDevclass.replacements = [];
        }
        if (!context.rawInput.installData.landscapeTransport) {
            context.rawInput.installData.landscapeTransport = {};
        }
        if (!context.rawInput.installData.skipPostActivities) {
            context.rawInput.installData.skipPostActivities = false;
        }
        //guard
        if (context.runtime.isTrmServer || context.runtime.isTrmRest) {
            context.rawInput.installData.installDevclass.keepOriginal = false;
        }

        //3- check install transport layer
        //the system default is resolved by generate-devclass, only when transportable packages are created
        if (context.rawInput.installData.installDevclass.transportLayer) {
            Logger.loading(`Checking transport layer...`);
            if (!(await SystemConnector.isTransportLayerExist(context.rawInput.installData.installDevclass.transportLayer))) {
                throw new Error(`Transport layer "${context.rawInput.installData.installDevclass.transportLayer}" doesn't exist.`);
            }
        }

        //4- check/set system target
        context.rawInput.installData.landscapeTransport.targetSystem = await setLandscapeTarget(
            context.rawInput.contextData.noInquirer,
            context.rawInput.installData.landscapeTransport.targetSystem,
            "Install transport target",
            "Install transport won't be generated."
        );

        //5- check if already installed
        context.runtime.update = context.rawInput.contextData.systemPackages.find(o => Manifest.compare(o.manifest, new Manifest(context.runtime.package.data.manifest), false));
        if (context.runtime.update) {
            const installedVersion = context.runtime.update.manifest.get().version;
            // trm-server and trm-rest run this install: see the selfUpdate steps
            context.runtime.selfUpdate = context.runtime.isTrmServer || context.runtime.isTrmRest;
            context.runtime.previousInstallPackages = await SystemConnector.getInstallPackages(
                context.rawInput.packageData.name,
                context.runtime.installRegistry
            );
            // A legacy backend has no install transports table: trm-server and trm-rest ship
            // no customizing or translations, so there is nothing recorded to read.
            if (!context.legacyBackend) {
                context.runtime.previousInstallTransports = await SystemConnector.getInstallTransports(
                    context.rawInput.packageData.name,
                    context.runtime.installRegistry
                );
            }
            const installVersion = context.runtime.package.data.manifest.version;
            //transports TRM generated for the package (e.g. of a rolled back release) aren't changes made on the system
            const dirtyEntries = await withoutOwnTrmTransports(context.runtime.update.getDirtyEntries(), context.runtime.update.packageName);
            if (eq(installVersion, installedVersion)) {
                if (context.rawInput.packageData.overwrite) {
                    if (dirtyEntries.length > 0) {
                        let ignoreDirty = false;
                        Logger.warning(`${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be overwritten!`, { important: true });
                        logDirtyEntries(dirtyEntries);
                        if (!context.rawInput.contextData.noInquirer) {
                            ignoreDirty = (await Inquirer.prompt({
                                message: `Continue with install?`,
                                type: 'confirm',
                                default: false,
                                name: 'ignoreDirty'
                            })).ignoreDirty;
                        }
                        if (!ignoreDirty) {
                            throw new Error(`Install aborted.`);
                        }
                    }
                    Logger.info(`${context.rawInput.packageData.name} v${installedVersion} already installed in ${SystemConnector.getDest()}, overwriting.`);
                } else {
                    throw new Error(`Install aborted. ${context.rawInput.packageData.name} v${installedVersion} already installed in ${SystemConnector.getDest()}. If you wish to overwrite, rerun install with overwrite feature.`);
                }
            } else {
                if (gt(installVersion, installedVersion)) {
                    Logger.info(`${chalk.bold('Upgrading')} ${installedVersion} -> ${installVersion}`);
                } else {
                    Logger.warning(`${chalk.bold('Downgrading')} ${installedVersion} -> ${installVersion}`);
                }
                if (dirtyEntries.length > 0) {
                    Logger.warning(`${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be overwritten!`, { important: true });
                    logDirtyEntries(dirtyEntries);
                }
                if (context.runtime.isTrmServer && valid(installedVersion) && lt(installedVersion, TRM_SERVER_API_VERSION) && !lt(installVersion, TRM_SERVER_API_VERSION)) {
                    // the install continues with the imported release: an unauthorized user can't complete it
                    Logger.warning(`trm-server ${TRM_SERVER_API_VERSION} authorizes users with authorization object ZTRM_AUTH (ACTVT 16) instead of table /ATRM/USERS: ${SystemConnector.getLogonUser()} and the other TRM users need it.`, { important: true });
                }
            }
        } else {
            Logger.info(`Package first install on ${SystemConnector.getDest()}`, true);
        }

        Logger.info(`Ready to install ${context.runtime.package.data.manifest.name} v${context.runtime.package.data.manifest.version}${!valid(context.rawInput.packageData.version) ? (' (' + (context.rawInput.packageData.version || 'latest') + ')') : ''}.`);
    }
}
