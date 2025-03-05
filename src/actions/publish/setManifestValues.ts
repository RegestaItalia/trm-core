import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer, validatePackageVisibility } from "../../inquirer";
import { RegistryType } from "../../registry";
import { Manifest } from "../../manifest";
import chalk from "chalk";
import { FileSystem, LOCAL_RESERVED_KEYWORD } from "../../registry/FileSystem";

/**
 * Set manifest values
 * 
 * 1- check if previous release manifest values should be copied
 * 
 * 2- input manifest values
 * 
 * 3- set namespace values (if necessary)
 * 
 * 4- set registry endpoint
 * 
 * 5- normalize manifest values
 * 
*/
export const setManifestValues: Step<PublishWorkflowContext> = {
    name: 'set-manifest-values',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set manifest values step', true);

        //1- check if previous release manifest values should be copied
        if (context.rawInput.publishData.keepLatestReleaseManifestValues) {
            if (context.runtime.trmPackage.latestReleaseManifest) {
                Logger.log(`Setting manifest values like latest version (${context.runtime.trmPackage.latestReleaseManifest.version})`, true);
                context.runtime.trmPackage.manifest.description = context.runtime.trmPackage.manifest.description || context.runtime.trmPackage.latestReleaseManifest.description;
                context.runtime.trmPackage.manifest.git = context.runtime.trmPackage.manifest.git || context.runtime.trmPackage.latestReleaseManifest.git;
                context.runtime.trmPackage.manifest.license = context.runtime.trmPackage.manifest.license || context.runtime.trmPackage.latestReleaseManifest.license;
                context.runtime.trmPackage.manifest.website = context.runtime.trmPackage.manifest.website || context.runtime.trmPackage.latestReleaseManifest.website;
                if(context.runtime.trmPackage.manifest.authors){
                    if(Array.isArray(context.runtime.trmPackage.manifest.authors) && context.runtime.trmPackage.manifest.authors.length === 0){
                        context.runtime.trmPackage.manifest.authors = context.runtime.trmPackage.latestReleaseManifest.authors;
                    }
                }else{
                    context.runtime.trmPackage.manifest.authors = context.runtime.trmPackage.latestReleaseManifest.authors;
                }
                if(context.runtime.trmPackage.manifest.keywords){
                    if(Array.isArray(context.runtime.trmPackage.manifest.keywords) && context.runtime.trmPackage.manifest.keywords.length === 0){
                        context.runtime.trmPackage.manifest.keywords = context.runtime.trmPackage.latestReleaseManifest.keywords;
                    }
                }else{
                    context.runtime.trmPackage.manifest.keywords = context.runtime.trmPackage.latestReleaseManifest.keywords;
                }
            }
        }

        //2- input manifest values
        if (!context.rawInput.contextData.noInquirer) {
            var defaultAuthors: string;
            var defaultKeywords: string;
            if (Array.isArray(context.runtime.trmPackage.manifest.authors)) {
                defaultAuthors = context.runtime.trmPackage.manifest.authors.map(o => {
                    var author: string;
                    if (o.name) {
                        author = o.name;
                        if (o.email) {
                            author += ` <${o.email}>`;
                        }
                    } else if (o.email) {
                        author = o.email;
                    }
                    return author;
                }).filter(o => o !== undefined).join(', ');
            } else {
                defaultAuthors = context.runtime.trmPackage.manifest.authors;
            }
            if (Array.isArray(context.runtime.trmPackage.manifest.keywords)) {
                defaultKeywords = context.runtime.trmPackage.manifest.keywords.join(', ');
            } else {
                defaultKeywords = context.runtime.trmPackage.manifest.keywords;
            }
            var inq = await Inquirer.prompt([{
                type: "list",
                message: "Package visibility",
                name: "private",
                default: context.runtime.trmPackage.manifest.private,
                choices: [{
                    name: `Public`,
                    value: false
                }, {
                    name: `Private`,
                    value: true
                }],
                when: () => {
                    return context.rawInput.packageData.registry.getRegistryType() !== RegistryType.LOCAL;
                },
                validate: (input: boolean) => {
                    return validatePackageVisibility(
                        context.rawInput.packageData.registry.getRegistryType(),
                        context.rawInput.packageData.name,
                        input,
                        context.runtime.trmPackage.latestReleaseManifest ? context.runtime.trmPackage.latestReleaseManifest.private : undefined
                    );
                },
            }, {
                type: "input",
                message: "Short description",
                name: "description",
                default: context.runtime.trmPackage.manifest.description,
                validate: (input) => {
                    if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC) {
                        if (input.length > 50) {
                            return "Maximum length: 50 characters";
                        } else {
                            return true;
                        }
                    } else {
                        return true;
                    }
                }
            }, {
                type: "input",
                message: "Website",
                name: "website",
                default: context.runtime.trmPackage.manifest.website,
                validate: (input) => {
                    if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC) {
                        if (input.length > 100) {
                            return "Maximum length: 100 characters";
                        } else {
                            return true;
                        }
                    } else {
                        return true;
                    }
                }
            }, {
                type: "input",
                message: "Git repository",
                name: "git",
                default: context.runtime.trmPackage.manifest.git,
                validate: (input) => {
                    if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC) {
                        if (input.length > 100) {
                            return "Maximum length: 100 characters";
                        } else {
                            return true;
                        }
                    } else {
                        return true;
                    }
                }
            }, {
                type: "input",
                message: "Authors (separated by comma)",
                name: "authors",
                default: defaultAuthors
            }, {
                type: "input",
                message: "Keywords (separated by comma)",
                name: "keywords",
                default: defaultKeywords
            }, {
                type: "input",
                message: "License",
                name: "license",
                default: context.runtime.trmPackage.manifest.license
                //validate -> TODO should validate if on public registry!
            }]);
            context.runtime.trmPackage.manifest = { ...context.runtime.trmPackage.manifest, ...inq };
        }
        if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL){
            context.runtime.trmPackage.manifest.private = true; //fixed value on local save
        }else{
            Logger.info(`Package visibility: ${chalk.bold(context.runtime.trmPackage.manifest.private ? 'private' : 'public')}`);
        }

        //3- set namespace values (if necessary)
        if (context.runtime.packageData.namespace) {
            context.runtime.trmPackage.manifest.namespace = {
                ns: context.runtime.packageData.namespace.trnspacet.namespace,
                replicense: context.runtime.packageData.namespace.trnspacet.replicense,
                texts: context.runtime.packageData.namespace.trnspacett.map(o => {
                    return {
                        description: o.descriptn,
                        language: o.spras,
                        owner: o.owner
                    };
                })
            };
        }

        //4- set registry endpoint
        if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL){
            context.runtime.trmPackage.manifest.registry = LOCAL_RESERVED_KEYWORD;
        }else if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.PRIVATE){
            context.runtime.trmPackage.manifest.registry = context.rawInput.packageData.registry.endpoint;
        }

        //5- normalize manifest values
        context.runtime.trmPackage.manifest = Manifest.normalize(context.runtime.trmPackage.manifest, false);
    }
}