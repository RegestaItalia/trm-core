import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { parsePackageName } from "../../commons";
import { TrmPackage } from "../../trmPackage";
import { Inquirer } from "../../inquirer";
import { clean } from "semver";
import { SystemConnector } from "../../systemConnector";
import { RegistryType } from "../../registry";
import { Transport } from "../../transport";

/**
 * Init
 * 
 * 1- check package name is compliant
 *  
 * 2- fill missing context/input data
 *  
 * 3- normalize install version
 * 
 * 4- set runtime data
 * 
 * 5- check package existance
 * 
 * 6- check publish allowed
 * 
*/
export const init: Step<PublishWorkflowContext> = {
    name: 'init',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);
        const registry = context.rawInput.packageData.registry;
        if(registry.getRegistryType() === RegistryType.PUBLIC){
            Logger.log(`Public registry, checking if logged in`, true);
            try{
                await registry.whoAmI();
            }catch(e){
                throw new Error(`Publish not allowed: ${e.message}`);
            }
        }

        //1- check package name is compliant
        context.rawInput.packageData.name = parsePackageName({
            fullName: context.rawInput.packageData.name
        }).fullName;

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
        if(typeof(context.rawInput.publishData.customizingTransports) === 'string'){
            context.rawInput.publishData.customizingTransports = context.rawInput.publishData.customizingTransports.split(',').map(o => {
                try{
                    return new Transport(o.trim());
                }catch(e){
                    throw new Error(`Invalid customizing transport values: trkorr.`);
                }
            });
        }

        //3- normalize install version
        if (!context.rawInput.packageData.version) {
            context.rawInput.packageData.version = 'latest';
        }
        var normalizeVersion = true;
        var normalizedVersion: string;
        Logger.loading(`Checking package version...`);
        while (normalizeVersion) {
            //this method will also throw error in case the specified version already exists in the registry
            normalizedVersion = await TrmPackage.normalizeVersion(context.rawInput.packageData.name, context.rawInput.packageData.version, registry);
            if (normalizedVersion !== context.rawInput.packageData.version) {
                Logger.info(`Version ${context.rawInput.packageData.version} -> ${normalizedVersion}`);
                if (!context.rawInput.contextData.noInquirer) {
                    const inq = await Inquirer.prompt([{
                        name: 'acceptNormalized',
                        message: `Continue publish as version ${normalizedVersion}?`,
                        type: 'confirm',
                        default: true
                    }, {
                        name: 'inputVersion',
                        message: `Input version to publish`,
                        type: 'input',
                        when: (hash) => {
                            return !hash.acceptNormalized
                        },
                        validate: (input) => {
                            if (!input) {
                                return false;
                            } else {
                                if (input.trim().toLowerCase() === 'latest') {
                                    return true;
                                } else {
                                    return clean(input) ? true : false;
                                }
                            }
                        }
                    }]);
                    if (inq.acceptNormalized) {
                        normalizeVersion = false;
                        context.rawInput.packageData.version = normalizedVersion;
                    } else {
                        normalizeVersion = true;
                        context.rawInput.packageData.version = inq.inputVersion;
                    }
                } else {
                    normalizeVersion = false;
                    context.rawInput.packageData.version = normalizedVersion;
                }
            } else {
                normalizeVersion = false;
            }
        }

        //4- set runtime data
        context.runtime = {
            rollback: false,
            trmPackage: {
                package: new TrmPackage(context.rawInput.packageData.name, registry),
                registry,
                manifest: {
                    ...context.rawInput.packageData.manifest,
                    ...{
                        name: context.rawInput.packageData.name,
                        version: context.rawInput.packageData.version
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
        if(context.rawInput.publishData.skipCustomizingTransports){
            context.rawInput.publishData.customizingTransports = [];
        }

        Logger.loading(`Checking package "${context.rawInput.packageData.name}"...`);

        //5- check package existance
        const packageExists = await context.runtime.trmPackage.package.exists();

        //5- check publish allowed
        const canPublishReleases = await context.runtime.trmPackage.package.canPublishReleases();
        if (!canPublishReleases.canPublishReleases) {
            if(canPublishReleases.cause){
                Logger.error(canPublishReleases.cause);
            }
            throw new Error(`You are not not authorized to publish "${context.rawInput.packageData.name}" releases.`);
        }

        if (!packageExists) {
            Logger.info(`First time publishing "${context.rawInput.packageData.name}". Congratulations!`);
        }else{
            context.runtime.trmPackage.latestReleaseManifest = (await context.runtime.trmPackage.package.fetchRemoteManifest('latest')).get();
            if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC && !!(context.rawInput.publishData.private) !== !!(context.runtime.trmPackage.latestReleaseManifest.private)){
                throw new Error(`Cannot change package "${context.rawInput.packageData.name}" visibility from ${context.runtime.trmPackage.latestReleaseManifest.private ? 'private' : 'public'} to ${context.rawInput.publishData.private ? 'private' : 'public'}.`);
            }
        }
    },
    revert: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Rollback init step', true);
        if (context.runtime && context.runtime.rollback) {
            Logger.success(`Rollback executed.`);
        }
    }
}