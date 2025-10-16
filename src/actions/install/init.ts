import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { TrmArtifact } from "../../trmPackage";
import { createHash } from "crypto";
import { SystemConnector } from "../../systemConnector";
import { AbstractRegistry, RegistryType } from "../../registry";
import { valid } from "semver";
import { TrmManifest } from "../../manifest";
import { Package, Ping } from "trm-registry-types";

/**
 * Init
 * 
 * 1- check package name is compliant
 * 
 * 2- format version
 * 
 * 3- set runtime data
 * 
 * 5- fill missing input data
 * 
*/
export const init: Step<InstallWorkflowContext> = {
    name: 'init',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);
        const registry = context.rawInput.packageData.registry;

        var artifact: TrmArtifact;
        var manifest: TrmManifest;
        var packageData: Package;

        //Local registry
        var actualRegistry: AbstractRegistry;
        //
        if (registry.getRegistryType() === RegistryType.LOCAL) {
            //if it's a local package it could be a download from a registry
            try {
                artifact = await registry.downloadArtifact('dummy', 'dummy');
            } catch {
                throw new Error(`Unable to read local package.`);
            }
            const oManifest = artifact.getManifest();
            manifest = oManifest.get();
            packageData.manifest = manifest; //fill missing manifest
            actualRegistry = oManifest.getPackage().registry;
            context.rawInput.packageData.name = manifest.name;
        }

        //1- format version
        context.rawInput.packageData.version = valid(context.rawInput.packageData.version);

        //2- fetch package in registry
        if (registry.getRegistryType() !== RegistryType.LOCAL) {
            Logger.loading(`Fetching package in registry ${registry.name}...`);
            packageData = await registry.getPackage(context.rawInput.packageData.name, context.rawInput.packageData.version);
            artifact = await registry.downloadArtifact(context.rawInput.packageData.name, context.rawInput.packageData.version);
            const checksum = createHash("sha512").update(artifact.binary).digest("hex");
            if (checksum !== packageData.checksum) {
                var ping: Ping;
                try{
                    ping = await registry.ping();
                }catch { }
                Logger.error(`SECURITY ISSUE! Release checksum does NOT match!`);
                Logger.error(`SECURITY ISSUE! Expected SHA is ${packageData.checksum}, current SHA is ${checksum}`);
                Logger.error(`SECURITY ISSUE! Please, report the issue to ${ping && ping.alert_email ? ping.alert_email : 'registry moderation team'}`);
                throw new Error(`Cannot continue due to security issues.`);
            }
            manifest = artifact.getManifest().get();
        }
        Logger.info(`Ready to install ${manifest.name} v${manifest.version}.`);

        //3- set runtime data
        context.runtime = {
            registry: actualRegistry || registry,
            update: undefined,
            rollback: false,
            remotePackageData: {
                data: packageData,
                artifact,
                manifest
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

        //4- fill missing input data
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