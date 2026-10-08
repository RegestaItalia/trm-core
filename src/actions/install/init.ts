import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector, TRM_REST_PACKAGE_NAME, TRM_SERVER_PACKAGE_NAME } from "../../systemConnector";
import { RegistryType } from "../../registry";
import { eq, gt, valid } from "semver";
import { Manifest } from "../../manifest";
import chalk from "chalk";
import { setLandscapeTarget } from "../commons/prompts";
import { logDirtyEntries, resolveInstallPackage } from "../commons/utils";

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
            transports: {
                devc: undefined,
                tadir: undefined,
                lang: undefined,
                cust: []
            },
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

        Logger.loading(`Fetching package in registry ${registry.name}...`);
        context.runtime.package.data = await registry.getPackage(context.rawInput.packageData.name, context.rawInput.packageData.version || 'latest');
        context.output.manifest = context.runtime.package.data.manifest;

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
            context.runtime.previousInstallPackages = await SystemConnector.getInstallPackages(
                context.rawInput.packageData.name,
                context.runtime.installRegistry
            );
            context.runtime.previousInstallTransports = await SystemConnector.getInstallTransports(
                context.rawInput.packageData.name,
                context.runtime.installRegistry
            );
            const installVersion = context.runtime.package.data.manifest.version;
            const installedVersion = context.runtime.update.manifest.get().version;
            if (eq(installVersion, installedVersion)) {
                if (context.rawInput.packageData.overwrite) {
                    if (context.runtime.update.isDirty()) {
                        let ignoreDirty = false;
                        Logger.warning(`${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be overwritten!`, { important: true });
                        logDirtyEntries(context.runtime.update.getDirtyEntries());
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
                if (context.runtime.update.isDirty()) {
                    Logger.warning(`${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be overwritten!`, { important: true });
                    logDirtyEntries(context.runtime.update.getDirtyEntries());
                }
            }
        } else {
            Logger.info(`Package first install on ${SystemConnector.getDest()}`, true);
        }

        Logger.info(`Ready to install ${context.runtime.package.data.manifest.name} v${context.runtime.package.data.manifest.version}${!valid(context.rawInput.packageData.version) ? (' (' + (context.rawInput.packageData.version || 'latest') + ')') : ''}.`);
    }
}
