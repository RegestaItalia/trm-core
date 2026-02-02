import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { RegistryType } from "../../registry";
import { SystemConnector } from "../../systemConnector";
import * as _ from "lodash";

/**
 * Run find dependencies workflow
 * 
 * 1- execute find dependencies on ABAP package
 * 
 * 2- find dependencies with custom packages
 * 
 * 3- find dependencies with local trm packages
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

        //1- execute find dependencies on ABAP package
        Logger.loading(`Searching for dependencies in package "${context.rawInput.packageData.devclass}"...`);
        const dependencies = await SystemConnector.getPackageDependencies(context.rawInput.packageData.devclass, true);
        const trmDependencies = await dependencies.getTrmDependencies();
        const trmLocalDependencies = trmDependencies.filter(o => o.registry.getRegistryType() === RegistryType.LOCAL);
        const otherDependencies = await dependencies.getOtherPackageDependencies();
        const sapDependencies = otherDependencies.filter(o => o.package.tpclass);
        const sapObjectsUsed = sapDependencies.flatMap(pkg => pkg.dependencies).reduce((sum, dep) => sum + dep.tabkey.length, 0);
        const customDependencies = otherDependencies.filter(o => !o.package.tpclass);

        //2- find dependencies with custom packages
        if (customDependencies.length > 0) {
            Logger.error(`Package "${context.rawInput.packageData.devclass}" has dependencies with ${customDependencies.length} non-TRM ${customDependencies.length === 1 ? 'package' : 'packages'}:`);
            customDependencies.forEach((d, i) => {
                Logger.error(`  (${i + 1}/${customDependencies.length}) ${d.package.devclass}`);
            });
            throw new Error(`Consider publishing them as TRM packages or refactor your development to avoid the dependency.`);
        }

        //3- find dependencies with local trm packages
        if (trmLocalDependencies.length > 0) {
            Logger.error(`Package "${context.rawInput.packageData.devclass}" has dependencies with ${trmLocalDependencies.length} TRM local ${customDependencies.length === 1 ? 'package' : 'packages'}:`);
            trmLocalDependencies.forEach((d, i) => {
                Logger.error(`  (${i + 1}/${customDependencies.length}) ${d.packageName}`);
            });
            throw new Error(`Cannot deliver to registry a TRM package with a local TRM package.`);
        }

        Logger.info(`Package "${context.rawInput.packageData.devclass}" has ${trmDependencies.length} TRM package ${trmDependencies.length === 1 ? 'dependency' : 'dependencies'} and references/uses ${sapObjectsUsed} SAP ${sapObjectsUsed === 1 ? 'object' : 'objects'}.`);

        //3- set trm dependencies in manifest
        Logger.log(`Adding TRM package dependencies to manifest`, true);
        Logger.info(`Updating "${context.rawInput.packageData.name}" manifest with dependencies:`);
        trmDependencies.forEach((o, i) => {
            if (o.manifest) {
                const dependencyManifest = o.manifest.get();
                const dependencyVersionRange = `^${dependencyManifest.version}`;
                const dependencyRegistry = o.registry.getRegistryType() === RegistryType.PUBLIC ? undefined : o.registry.endpoint;
                context.runtime.trmPackage.manifest.dependencies.push({
                    name: dependencyManifest.name,
                    version: dependencyVersionRange,
                    registry: dependencyRegistry
                });
                Logger.info(`  (${i + 1}/${trmDependencies.length}) ${dependencyManifest.name}${dependencyRegistry ? ' (' + o.registry.name + ')' : ''} ${dependencyVersionRange}`);
            } else {
                Logger.error(`  (${i + 1}/${trmDependencies.length}) Cannot find manifest of dependency in ABAP package "${o.getDevclass()}"`);
            }
        });

        //4- set sap entries in manifest
        Logger.log(`Adding SAP objects dependencies to manifest`, true);
        sapDependencies.forEach(o => {
            o.dependencies.forEach(d => {
                if (!context.runtime.trmPackage.manifest.sapEntries[d.tabname]) {
                    context.runtime.trmPackage.manifest.sapEntries[d.tabname] = [];
                }
                d.tabkey.forEach(k => {
                    if(!context.runtime.trmPackage.manifest.sapEntries[d.tabname].find(c => _.isEqual(c, k))){
                        context.runtime.trmPackage.manifest.sapEntries[d.tabname].push(k);
                    }
                });
            });
        });
    }
}