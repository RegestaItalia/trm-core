import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer, inspect, Logger } from "trm-commons";
import { FindDependenciesActionInput, findDependencies as FindDependenciesWkf } from ".."
import { RegistryType } from "../../registry";

const SUBWORKFLOW_NAME = 'find-dependencies-sub-publish';

const _isObjectEqual = (obj1: any, obj2: any): boolean => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    return keys1.every(key => obj2.hasOwnProperty(key) && obj1[key] === obj2[key]);
}

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
        if (aUnknownDependencyDevclass.length > 0) {
            Logger.error(`Package "${context.rawInput.packageData.devclass}" has ${aUnknownDependencyDevclass.length} missing ${aUnknownDependencyDevclass.length === 1 ? 'dependency' : 'dependencies'}:`);
            aUnknownDependencyDevclass.forEach((d, i) => {
                Logger.error(`  (${i + 1}/${aUnknownDependencyDevclass.length}) ${d}`);
            });
            throw new Error(`Resolve missing dependencies by publishing them as TRM packages.`);
        }

        Logger.info(`Package "${context.rawInput.packageData.devclass}" has ${result.trmPackageDependencies.withTrmPackage.length} TRM package ${result.trmPackageDependencies.withTrmPackage.length === 1 ? 'dependency' : 'dependencies'} and ${result.objectDependencies.sapObjects.reduce((sum, obj) => sum + obj.dependencies.length, 0)} required SAP ${result.objectDependencies.sapObjects.reduce((sum, obj) => sum + obj.dependencies.length, 0) === 1 ? 'object' : 'objects'}.`);

        //3- set trm dependencies in manifest
        Logger.log(`Adding TRM package dependencies to manifest`, true);
        Logger.loading(`Updating manifest...`);
        result.trmPackageDependencies.withTrmPackage.forEach((o, i) => {
            if (o.package.registry.getRegistryType() === RegistryType.LOCAL) {
                Logger.error(`  (${i + 1}/${result.trmPackageDependencies.withTrmPackage.length}) Cannot have dependency with ABAP package "${o.devclass}": TRM package was installed manually`);
            } else {
                if (o.package.manifest) {
                    const dependencyManifest = o.package.manifest.get();
                    const dependencyVersionRange = `^${dependencyManifest.version}`;

                    const dependencyRegistry = o.package.registry.getRegistryType() === RegistryType.PUBLIC ? undefined : o.package.registry.endpoint;
                    if (!o.integrity) {
                        if(o.ignoreNoIntegrity){
                            Logger.warning(`  (${i + 1}/${result.trmPackageDependencies.withTrmPackage.length}) ${dependencyManifest.name}: ${dependencyVersionRange} (Integrity not found!)`);
                        }else{
                            throw new Error(`  (${i + 1}/${result.trmPackageDependencies.withTrmPackage.length}) ${dependencyManifest.name}: Integrity not found!`);
                        }
                    }else{
                        Logger.info(`  (${i + 1}/${result.trmPackageDependencies.withTrmPackage.length}) ${dependencyManifest.name} ${dependencyVersionRange}`);
                    }
                    context.runtime.trmPackage.manifest.dependencies.push({
                        name: dependencyManifest.name,
                        version: dependencyVersionRange,
                        integrity: o.integrity,
                        registry: dependencyRegistry
                    });
                } else {
                    Logger.error(`  (${i + 1}/${result.trmPackageDependencies.withTrmPackage.length}) Cannot find manifest of dependency in ABAP package "${o.devclass}"`);
                }
            }
        });

        //4- set sap entries in manifest
        Logger.log(`Adding SAP objects dependencies to manifest`, true);
        Logger.loading(`Updating manifest...`);
        result.objectDependencies.sapObjects.forEach(o => {
            if (!context.runtime.trmPackage.manifest.sapEntries[o.table]) {
                context.runtime.trmPackage.manifest.sapEntries[o.table] = [];
            }
            o.dependencies.forEach(k => {
                var tableKeys = k.object;
                if (o.table === 'TADIR') {
                    delete tableKeys['DEVCLASS']; //might be used wrongly as key in tadir (older versions of trm, might not be relevant)
                }
                if (!context.runtime.trmPackage.manifest.sapEntries[o.table].some(o => _isObjectEqual(o, tableKeys))) {
                    context.runtime.trmPackage.manifest.sapEntries[o.table].push(tableKeys);
                }
            });
        });
    }
}