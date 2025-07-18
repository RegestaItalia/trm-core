import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { TrmPackage } from "../../trmPackage";
import { parsePackageName } from "../../commons";
import { createHash } from "crypto";
import { SystemConnector } from "../../systemConnector";
import { RegistryType } from "../../registry";

/**
 * Init
 * 
 * 1- check package name is compliant
 * 
 * 2- format install version -> set latest if nothing specified
 * 
 * 3- fetch package in registry
 * 
 * 4- set package data from registry
 * 
 * 5- fill missing input data
 * 
*/
export const init: Step<InstallWorkflowContext> = {
    name: 'init',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);
        const registry = context.rawInput.packageData.registry;

        //1- check package name is compliant
        context.rawInput.packageData.name = parsePackageName({
            fullName: context.rawInput.packageData.name
        }).fullName;

        //2- format install version -> set latest if nothing specified
        if (!context.rawInput.packageData.version || context.rawInput.packageData.version.trim().toLowerCase() === 'latest') {
            context.rawInput.packageData.version = 'latest';
        }

        //3- fetch package in registry
        if (registry.getRegistryType() === RegistryType.LOCAL) {
            Logger.loading(`Reading TRM package data...`);
        } else {
            Logger.loading(`Searching TRM package in registry ${registry.name}...`);
        }
        const trmPackage = new TrmPackage(context.rawInput.packageData.name, registry);
        const artifact = await trmPackage.fetchRemoteArtifact(context.rawInput.packageData.version);
        const integrity = createHash("sha512").update(artifact.binary).digest("hex");
        const manifest = await trmPackage.fetchRemoteManifest(context.rawInput.packageData.version);
        const trmManifest = manifest.get();
        var sVersion = trmManifest.version;
        if (context.rawInput.packageData.version === 'latest') {
            sVersion = `latest -> ${trmManifest.version}`;
        }
        if (registry.getRegistryType() === RegistryType.LOCAL) {
            Logger.info(`Ready to install "${trmManifest.name}" version ${trmManifest.version}.`);
        } else {
            Logger.info(`Ready to install "${trmManifest.name}" version ${sVersion} from registry "${registry.name}".`);
        }

        //4- set package data from registry
        context.runtime = {
            registry,
            update: undefined,
            rollback: false,
            remotePackageData: {
                version: context.rawInput.packageData.version,
                trmPackage,
                trmManifest,
                manifest,
                artifact,
                integrity
            },
            dependenciesToInstall: [],
            r3trans: undefined,
            packageTransports: {
                devc: {
                    binaries: undefined,
                    instance: undefined
                },
                tadir: {
                    binaries: undefined,
                    instance: undefined
                },
                cust: {
                    binaries: undefined,
                    instance: undefined
                },
                lang: {
                    binaries: undefined,
                    instance: undefined
                }
            },
            packageTransportsData: {
                tdevc: [],
                tdevct: [],
                tadir: [],
                e071: []
            },
            installData: {
                transport: undefined,
                namespace: undefined,
                entries: []
            },
            originalData: {
                hierarchy: undefined
            },
            generatedData: {
                devclass: [],
                namespace: undefined,
                migrations: [],
                tmsTxtRefresh: []
            }
        };

        //5- fill missing input data
        if (context.rawInput.packageData.overwrite === undefined) {
            context.rawInput.packageData.overwrite = false;
        }
        if (!context.rawInput.contextData) {
            context.rawInput.contextData = {};
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
        if (!context.rawInput.installData.installTransport) {
            context.rawInput.installData.installTransport = {
                create: true
            };
        }
        if (!context.rawInput.installData.skipPostActivities) {
            context.rawInput.installData.skipPostActivities = false;
        }
        if (context.rawInput.installData.installDevclass.keepOriginal === undefined) {
            if (!context.rawInput.contextData.noInquirer) {
                context.rawInput.installData.installDevclass.keepOriginal = (await Inquirer.prompt([{
                    name: 'keepOriginal',
                    message: `Keep original ABAP package(s)?`,
                    type: 'confirm',
                    default: context.rawInput.installData.installDevclass.keepOriginal ? true : false
                }])).keepOriginal;
            }
        }
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
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Rollback init step', true);

        if (context.runtime && context.runtime.rollback) {
            Logger.success(`Rollback executed.`);
        }
    }
}