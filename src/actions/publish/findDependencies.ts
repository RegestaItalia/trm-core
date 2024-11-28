import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { inspect, Logger } from "../../logger";
import { FindDependenciesActionInput, findDependencies as FindDependenciesWkf } from ".."
import { RegistryType } from "../../registry";
import { Inquirer } from "../../inquirer";

const SUBWORKFLOW_NAME = 'find-dependencies-sub-publish';

/**
 * Run find dependencies workflow
 * 
 * 1- execute find dependencies workflow on ABAP package
 * 
 * 2- find dependencies with custom packages and missing TRM package
 * 
 * 3- set dependencies in manifest
 * 
 * 4- set sap entries in manifest
 * 
*/
export const findDependencies: Step<PublishWorkflowContext> = {
    name: 'find-dependencies',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.rawInput.publishData.noDependenciesDetection) {
            Logger.log(`Skipping automatic dependencies detection (user input)`, true);
            Logger.warning(`Skipping automatic dependency detection can cause your package to fail activation during install. Make sure to manually edit the dependencies later if necessary.`);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Find dependencies step', true);

        //1- execute find dependencies workflow on ABAP package
        Logger.loading(`Searching for dependencies in package "${context.rawInput.packageData.devclass}"...`);
        const inputData: FindDependenciesActionInput = {
            packageData: {
                package: context.rawInput.packageData.devclass,
                objects: context.runtime.packageData.tadir
            },
            contextData: {
                noInquirer: context.rawInput.contextData.noInquirer
            },
            printOptions: {
                sapObjectDependencies: false,
                trmDependencies: false
            }
        };
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        const result = await FindDependenciesWkf(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
        
        //2- find dependencies with custom packages and missing TRM package
        const aUnknownDependencyDevclass = (result.trmPackageDependencies.withoutTrmPackage).map(o => o.devclass);
        if(aUnknownDependencyDevclass.length > 0){
            Logger.error(`Package "${context.rawInput.packageData.devclass}" has ${aUnknownDependencyDevclass.length} missing ${aUnknownDependencyDevclass.length === 1 ? 'dependency' : 'dependencies'}:`);
            aUnknownDependencyDevclass.forEach((d, i) => {
                Logger.error(`  (${i+1}/{${aUnknownDependencyDevclass.length}) ${d}`);
            });
            throw new Error(`Resolve missing dependencies by publishing them as TRM packages.`);
        }

        Logger.info(`Package "${context.rawInput.packageData.devclass}" has ${result.trmPackageDependencies.withTrmPackage.length} TRM package ${result.trmPackageDependencies.withTrmPackage.length === 1 ? 'dependency' : 'dependencies'} and ${result.objectDependencies.sapObjects.length} required SAP ${result.objectDependencies.sapObjects.length === 1 ? 'object' : 'objects'}.`);

        //3- set trm dependencies in manifest
        Logger.log(`Adding TRM package dependencies to manifest`, true);
        Logger.loading(`Updating manifest...`);
        result.trmPackageDependencies.withTrmPackage.forEach((o, i) => {
            if(o.package.manifest){
                const dependencyManifest = o.package.manifest.get();
                const dependencyVersionRange = `^${dependencyManifest.version}`;
                const dependencyRegistry = o.package.registry.getRegistryType() === RegistryType.PUBLIC ? undefined : o.package.registry.endpoint;
                if(!o.integrity){
                    throw new Error(`  (${i+1}/{${result.trmPackageDependencies.withTrmPackage}) ${dependencyManifest.name}: Integrity not found!`);
                }
                Logger.info(`  (${i+1}/{${result.trmPackageDependencies.withTrmPackage}) ${dependencyManifest.name} ${dependencyVersionRange}`);
                context.runtime.trmPackage.manifest.dependencies.push({
                    name: dependencyManifest.name,
                    version: dependencyVersionRange,
                    integrity: o.integrity,
                    registry: dependencyRegistry
                });
            }else{
                Logger.error(`  (${i+1}/{${result.trmPackageDependencies.withTrmPackage}) Cannot find manifest of dependency in ABAP package "${o.devclass}"`);
            }
        });
        if(!context.rawInput.contextData.noInquirer){
            const inq = await Inquirer.prompt([{
                message: `Do you want to manually edit dependencies?`,
                type: 'confirm',
                name: 'editDependencies',
                default: false
            }, {
                message: 'Editor dependencies',
                type: 'editor',
                name: 'dependencies',
                postfix: '.json',
                when: (hash) => {
                    return hash.editDependencies
                },
                default: JSON.stringify(context.runtime.trmPackage.manifest.dependencies, null, 2),
                validate: (input) => {
                    try {
                        const parsedInput = JSON.parse(input);
                        if(Array.isArray(parsedInput)){
                            return true;
                        }else{
                            return 'Invalid array';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if(inq.dependencies){
                Logger.log(`Dependencies were manually changed: before -> ${JSON.stringify(context.runtime.trmPackage.manifest.dependencies)}, after -> ${JSON.parse(inq.dependencies)}`, true);
                context.runtime.trmPackage.manifest.dependencies = JSON.parse(inq.dependencies);
            }
        }

        //4- set sap entries in manifest
        Logger.log(`Adding SAP objects dependencies to manifest`, true);
        Logger.loading(`Updating manifest...`);
        result.objectDependencies.sapObjects.forEach(o => {
            if(!context.runtime.trmPackage.manifest.sapEntries[o.table]){
                context.runtime.trmPackage.manifest.sapEntries[o.table] = [];
            }
            o.dependencies.forEach(k => {
                var tableKeys = k.object;
                if (o.table === 'TADIR') {
                    delete tableKeys['DEVCLASS']; //might be used wrongly as key in tadir (older versions of trm, might not be relevant)
                }
                context.runtime.trmPackage.manifest.sapEntries[o.table].push(tableKeys);
            });
        });
        if(!context.rawInput.contextData.noInquirer){
            const inq = await Inquirer.prompt([{
                message: `Do you want to manually required SAP objects?`,
                type: 'confirm',
                name: 'editSapEntries',
                default: false
            }, {
                message: 'Edit SAP entries',
                type: 'editor',
                name: 'sapEntries',
                postfix: '.json',
                when: (hash) => {
                    return hash.editSapEntries
                },
                default: JSON.stringify(context.runtime.trmPackage.manifest.sapEntries, null, 2),
                validate: (input) => {
                    try {
                        const parsedInput = JSON.parse(input);
                        if(typeof(parsedInput) === 'object' && !Array.isArray(parsedInput)){
                            return true;
                        }else{
                            return 'Invalid object';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if(inq.sapEntries){
                Logger.log(`SAP entries were manually changed: before -> ${JSON.stringify(context.runtime.trmPackage.manifest.sapEntries)}, after -> ${JSON.parse(inq.sapEntries)}`, true);
                context.runtime.trmPackage.manifest.sapEntries = JSON.parse(inq.sapEntries);
            }
        }
    }
}