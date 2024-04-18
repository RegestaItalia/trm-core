import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { Inquirer } from "../../inquirer/Inquirer";
import { clean } from "semver";
import { parsePackageName } from "../../commons";

export const init: Step<PublishWorkflowContext> = {
    name: 'init',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const registry = context.rawInput.registry;
        if (process.env.TRM_ENV === 'DEV') {
            Logger.warning(`Running in development, rolling back after publish (PACKAGE WON'T BE UNPUBLISHED FROM REGISTRY!)`);
        }
        var packageName = context.rawInput.package.name.toLowerCase().trim();

        //check package name doesn't throw error
        packageName = parsePackageName({
            fullName: packageName
        }).fullName;

        var packageVersion = context.rawInput.package.version;

        if (!packageVersion) {
            throw new Error(`Package version empty.`);
        }

        var normalizeVersion = true;
        var normalizedVersion: string;
        Logger.loading(`Checking package version...`);
        while (normalizeVersion) {
            normalizedVersion = await TrmPackage.normalizeVersion(packageName, packageVersion, registry);
            if (normalizedVersion !== packageVersion) {
                Logger.info(`Version ${packageVersion} -> ${normalizedVersion}`);
                const inq1 = await Inquirer.prompt([{
                    name: 'acceptNormalized',
                    message: `Continue publish as version ${normalizedVersion}?`,
                    type: 'confirm'
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
                if (inq1.acceptNormalized) {
                    normalizeVersion = false;
                } else {
                    normalizeVersion = true;
                    packageVersion = inq1.inputVersion;
                }
            } else {
                normalizeVersion = false;
            }
        }

        context.parsedInput.packageName = packageName;
        context.parsedInput.version = normalizedVersion;
        context.parsedInput.releaseFolder = context.rawInput.tmpFolder;
        context.parsedInput.releaseTimeout = context.rawInput.releaseTimeout || 180;
        context.parsedInput.customizingTransports = context.rawInput.customizingTransports || [];

        context.runtime.registry = registry;
        context.runtime.dummyPackage = new TrmPackage(packageName, registry);

        context.runtime.manifest = context.rawInput.package;
        context.runtime.manifest.name = packageName;
        context.runtime.manifest.version = normalizedVersion;
        if (!context.runtime.manifest.sapEntries) {
            context.runtime.manifest.sapEntries = {};
        }
        if (!context.runtime.manifest.dependencies) {
            context.runtime.manifest.dependencies = [];
        }
    }
}