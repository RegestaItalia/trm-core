import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";


export const setManifestValues: Step<PublishWorkflowContext> = {
    name: 'set-manifest-values',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.forceManifestInput || (!context.parsedInput.forceManifestInput && !context.runtime.packageExistsOnRegistry)) {
            return true;
        } else {
            Logger.log(`Skip manifest input values step (force: ${context.parsedInput.forceManifestInput}, already exists: ${context.runtime.packageExistsOnRegistry})`, true);
            return false;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        var defaultAuthors: string;
        var defaultKeywords: string;
        if(context.runtime.manifest.authors){
            if(typeof(context.runtime.manifest.authors) === 'string'){
                defaultAuthors = context.runtime.manifest.authors;
            }else{
                try{
                    defaultAuthors = context.runtime.manifest.authors.map(o => {
                        if(o.name){
                            if(o.email){
                                return `${o.name} <${o.email}>`;
                            }else{
                                return o.name;
                            }
                        }else{
                            return o.email;
                        }
                    }).filter(s => s).join(', ');
                }catch(e){
                    defaultAuthors = '';
                }
            }
        }
        if(context.runtime.manifest.keywords){
            if(typeof(context.runtime.manifest.keywords) === 'string'){
                defaultKeywords = context.runtime.manifest.keywords;
            }else{
                try{
                    defaultKeywords = context.runtime.manifest.keywords.filter(s => s).join(', ');
                }catch(e){
                    defaultKeywords = '';
                }
            }
        }
        const inq1 = await Inquirer.prompt([{
            type: "input",
            message: "Package short description",
            name: "description",
            default: context.runtime.manifest.description,
            when: !context.parsedInput.silent
        }, {
            type: "input",
            message: "Website",
            name: "website",
            default: context.runtime.manifest.website,
            when: !context.parsedInput.silent
        }, {
            type: "input",
            message: "Package Git repository",
            name: "git",
            default: context.runtime.manifest.git,
            when: !context.parsedInput.silent
        }, {
            type: "input",
            message: "Authors (separated by comma)",
            name: "authors",
            when: !context.parsedInput.silent,
            default: defaultAuthors
        }, {
            type: "input",
            message: "Keywords (separated by comma)",
            name: "keywords",
            when: !context.parsedInput.silent,
            default: defaultKeywords
        }, {
            type: "input",
            message: "License",
            name: "license",
            default: context.runtime.manifest.license,
            when: !context.parsedInput.silent
        }]);
        context.runtime.manifest.description = context.runtime.manifest.description || inq1.description;
        context.runtime.manifest.website = context.runtime.manifest.website || inq1.website;
        context.runtime.manifest.git = context.runtime.manifest.git || inq1.git;
        context.runtime.manifest.authors = context.runtime.manifest.authors || inq1.authors;
        context.runtime.manifest.keywords = context.runtime.manifest.keywords || inq1.keywords;
        context.runtime.manifest.license = context.runtime.manifest.license || inq1.license;
    }
}