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
        const inq1 = await Inquirer.prompt([{
            type: "input",
            message: "Package short description",
            name: "description",
            default: context.runtime.manifest.description
        }, {
            type: "input",
            message: "Website",
            name: "website",
            default: context.runtime.manifest.website
        }, {
            type: "input",
            message: "Package Git repository",
            name: "git",
            default: context.runtime.manifest.git
        }, {
            type: "input",
            message: "Authors (separated by comma)",
            name: "authors",
            //default: TODO
        }, {
            type: "input",
            message: "Keywords (separated by comma)",
            name: "keywords",
            //default: TODO
        }, {
            type: "input",
            message: "License",
            name: "license",
            default: context.runtime.manifest.license,
        }]);
        context.runtime.manifest.description = context.runtime.manifest.description || inq1.description;
        context.runtime.manifest.website = context.runtime.manifest.website || inq1.website;
        context.runtime.manifest.git = context.runtime.manifest.git || inq1.git;
        context.runtime.manifest.authors = context.runtime.manifest.authors || inq1.authors;
        context.runtime.manifest.keywords = context.runtime.manifest.keywords || inq1.keywords;
        context.runtime.manifest.license = context.runtime.manifest.license || inq1.license;
    }
}