import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer";
import { RegistryType } from "../../registry";
import { Manifest } from "../../manifest";

/**
 * Set manifest values
 * 
 * 1- check if previous release manifest values should be copied
 * 
 * 2- input manifest values
 * 
 * 3- set namespace values (if necessary)
 * 
 * 4- normalize manifest values
 * 
*/
export const setManifestValues: Step<PublishWorkflowContext> = {
    name: 'set-manifest-values',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set manifest values step', true);

        //1- check if previous release manifest values should be copied
        if(context.rawInput.publishData.keepLatestReleaseManifestValues){
            if(context.runtime.trmPackage.latestReleaseManifest){
                Logger.log(`Setting manifest values like latest version (${context.runtime.trmPackage.latestReleaseManifest.version})`, true);
                context.runtime.trmPackage.manifest = {...context.runtime.trmPackage.latestReleaseManifest, ...context.runtime.trmPackage.manifest};
            }
        }

        //2- input manifest values
        if(!context.rawInput.contextData.noInquirer){
            var defaultAuthors: string;
            var defaultKeywords: string;
            if(Array.isArray(context.runtime.trmPackage.manifest.authors)){
                defaultAuthors = context.runtime.trmPackage.manifest.authors.map(o => {
                    var author: string;
                    if(o.name){
                        author = o.name;
                        if(o.email){
                            author += ` <${o.email}>`;
                        }
                    }else if(o.email){
                        author = o.email;
                    }else{
                        throw new Error(`Invalid manifest values: authors.`);
                    }
                    return author;
                }).join(', ');
            }else{
                defaultAuthors = context.runtime.trmPackage.manifest.authors;
            }
            if(Array.isArray(context.runtime.trmPackage.manifest.keywords)){
                defaultKeywords = context.runtime.trmPackage.manifest.keywords.join(', ');
            }else{
                defaultKeywords = context.runtime.trmPackage.manifest.keywords;
            }
            var inq = await Inquirer.prompt([{
                type: "input",
                message: "Short description",
                name: "description",
                default: context.runtime.trmPackage.manifest.description,
                validate: (input) => {
                    if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC){
                        if(input.length > 50){
                            return "Maximum length: 50 characters";
                        }else{
                            return true;
                        }
                    }else{
                        return true;
                    }
                }
            }, {
                type: "input",
                message: "Website",
                name: "website",
                default: context.runtime.trmPackage.manifest.website,
                validate: (input) => {
                    if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC){
                        if(input.length > 100){
                            return "Maximum length: 100 characters";
                        }else{
                            return true;
                        }
                    }else{
                        return true;
                    }
                }
            }, {
                type: "input",
                message: "Git repository",
                name: "git",
                default: context.runtime.trmPackage.manifest.git,
                validate: (input) => {
                    if(context.rawInput.packageData.registry.getRegistryType() === RegistryType.PUBLIC){
                        if(input.length > 100){
                            return "Maximum length: 100 characters";
                        }else{
                            return true;
                        }
                    }else{
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
            inq.authors = inq.authors.split(',').map(s => {
                const match = s.trim().match(/^(.*?)(?:\s*<([^>]+)>)?$/);
                if(match && match.length >= 3){
                    return {
                        name: match[1] ? match[1].trim() : undefined,
                        email: match[2] ? match[2].trim() : undefined
                    }
                }else{
                    throw new Error(`Invalid manifest values: authors.`);
                }
            });
            inq.keywords = inq.keywords.split(',').map(s => {
                if(s){
                    return s.trim();
                }else{
                    throw new Error(`Invalid manifest values: keywords.`);
                }
            });
            context.runtime.trmPackage.manifest = {...context.runtime.trmPackage.manifest, ...inq};
        }

        //3- set namespace values (if necessary)
        if(context.runtime.packageData.namespace){
            context.runtime.trmPackage.manifest.namespace = {
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
        
        //4- normalize manifest values
        context.runtime.trmPackage.manifest = Manifest.normalize(context.runtime.trmPackage.manifest, false);
    }
}