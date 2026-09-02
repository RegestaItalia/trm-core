import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector, TRM_REST_PACKAGE_NAME, TRM_SERVER_PACKAGE_NAME } from "../../systemConnector";
import { RegistryDeletionTransportUnauthorizedError, RegistryType } from "../../registry";
import { eq, gt, valid } from "semver";
import { Manifest } from "../../manifest";
import chalk from "chalk";
import { setTransportTarget } from "../commons/prompts";
import { releaseDeletionTransport } from "../commons/utils";

/**
 * Workflow step that fetches the release, validates install settings, and initializes rollback state.
 * 
 * 1- fill context data
 * 
 * 2- fill missing input data
 * 
 * 3- check/set install transport layer
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
            sapPackages: [],
            dele: undefined,
            namespace: undefined
        };

        Logger.loading(`Fetching package in registry ${registry.name}...`);
        context.runtime.package.data = await registry.getPackage(context.rawInput.packageData.name, context.rawInput.packageData.version || 'latest');
        context.output.manifest = context.runtime.package.data.manifest;

        //only used to validate manifest
        try {
            Manifest.normalize(context.runtime.package.data.manifest, false);
        } catch (e) {
            throw new Error(`Package manifest is invalid: ${e.toString()}`);
        }


        if (context.runtime.isLocal) {
            // guard and replace input name with actual name in manifest
            context.rawInput.packageData.name = context.runtime.package.data.manifest.name;
        }

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

        //3- check/set install transport layer
        Logger.loading(`Checking transport layer...`);
        if (!context.rawInput.installData.installDevclass.transportLayer) {
            try {
                context.rawInput.installData.installDevclass.transportLayer = await SystemConnector.getDefaultTransportLayer();
                Logger.log(`Setting transport layer to default: ${context.rawInput.installData.installDevclass.transportLayer}`, true);
            } catch (e) {
                Logger.error(e.toString(), true);
                throw new Error(`Couldn't determine system's default transport layer.`);
            }
        } else {
            if (!(await SystemConnector.isTransportLayerExist(context.rawInput.installData.installDevclass.transportLayer))) {
                throw new Error(`Transport layer "${context.rawInput.installData.installDevclass.transportLayer}" doesn't exist.`);
            }
        }

        //4- check/set system target
        Logger.loading(`Checking system target...`);
        context.rawInput.installData.landscapeTransport.targetSystem = await setTransportTarget(
            context.rawInput.contextData.noInquirer,
            await SystemConnector.getTransportTargets(),
            context.rawInput.installData.landscapeTransport.targetSystem,
            "Install transport target"
        );

        //5- check if already installed
        context.runtime.update = context.rawInput.contextData.systemPackages.find(o => Manifest.compare(o.manifest, new Manifest(context.runtime.package.data.manifest), false));
        if (context.runtime.update) {
            const installVersion = context.runtime.package.data.manifest.version;
            const installedVersion = context.runtime.update.manifest.get().version;
            if (eq(installVersion, installedVersion)) {
                if (context.rawInput.packageData.overwrite) {
                    if (context.runtime.update.isDirty()) {
                        var ignoreDirty = false;
                        Logger.warning(`${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be overwritten!`);
                        Logger.warning(`Consider analyzing dirty entries before overwrite.`);
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
            }
        } else {
            Logger.info(`Package first install on ${SystemConnector.getDest()}`, true);
        }

        Logger.info(`Ready to install ${context.runtime.package.data.manifest.name} v${context.runtime.package.data.manifest.version}${!valid(context.rawInput.packageData.version) ? (' (' + (context.rawInput.packageData.version || 'latest') + ')') : ''}.`);
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.revert.cleanupTransport) {
            try {
                const e071 = await context.revert.cleanupTransport.getE071();
                if (e071.length > 0) {
                    await releaseDeletionTransport(context.revert.cleanupTransport, context.rawInput.packageData.registry, context);
                } else {
                    //it should always be deletable, no need to check
                    await context.revert.cleanupTransport.delete();
                }
            } catch (e) {
                if (e instanceof RegistryDeletionTransportUnauthorizedError) {
                    context.revert.cleanupTransport = undefined;
                    Logger.warning(`User is not authorized to generate cleanup transports. Manual cleanup of revert steps might be necessary.`);
                    return;
                }
                //always try delete on error
                await context.revert.cleanupTransport.delete();
                throw e;
            }
        }
    }
}
