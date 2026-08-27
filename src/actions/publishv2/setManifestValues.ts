import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { RegistryType } from "../../registry";
import { Manifest, PostActivity, TrmManifestAuthor, TrmManifestDependency } from "../../manifest";
import { LOCAL_RESERVED_KEYWORD } from "../../registry/FileSystem";
import _ from 'lodash';
import { TrmPackage } from "../../trmPackage";

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
 * 5- set post install activities
 * 
 * 6- edit dependencies/sap entries
 * 
 * 7- normalize manifest values
 * 
 * 8- transform into xml
 * 
 * 9- generate trm package
 * 
*/
export const setManifestValues: Step<PublishWorkflowContext> = {
    name: 'set-manifest-values',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        //1- check if previous release manifest values should be copied
        if (context.rawInput.publishData.keepLatestReleaseManifestValues) {
            if (context.runtime.latest.data?.manifest) {
                const latestManifest = context.runtime.latest.data.manifest;
                //setting manifest values like latest version where there's no overwrite
                context.runtime.manifest.description ||= latestManifest.description;
                context.runtime.manifest.git ||= latestManifest.git;
                context.runtime.manifest.license ||= latestManifest.license;
                context.runtime.manifest.website ||= latestManifest.website;

                //merging input authors with latest release authors
                if (context.runtime.manifest.authors) {
                    if (Array.isArray(latestManifest.authors)) {
                        if (!Array.isArray(context.runtime.manifest.authors)) {
                            context.runtime.manifest.authors = Manifest.stringAuthorsToArray(context.runtime.manifest.authors);
                        }
                        latestManifest.authors.forEach(o => {
                            if (o.email && o.name) {
                                if (!(context.runtime.manifest.authors as TrmManifestAuthor[]).find(k => k.email === o.email && k.name === o.name)) {
                                    (context.runtime.manifest.authors as TrmManifestAuthor[]).push(o);
                                }
                            } else if (o.email) {
                                if (!(context.runtime.manifest.authors as TrmManifestAuthor[]).find(k => k.email === o.email)) {
                                    (context.runtime.manifest.authors as TrmManifestAuthor[]).push(o);
                                }
                            } else if (o.name) {
                                if (!(context.runtime.manifest.authors as TrmManifestAuthor[]).find(k => k.name === o.name)) {
                                    (context.runtime.manifest.authors as TrmManifestAuthor[]).push(o);
                                }
                            }
                        });
                    }
                } else {
                    context.runtime.manifest.authors = latestManifest.authors;
                }

                //merging input keywords with latest release keywords
                if (context.runtime.manifest.keywords) {
                    if (Array.isArray(latestManifest.keywords)) {
                        if (!Array.isArray(context.runtime.manifest.keywords)) {
                            context.runtime.manifest.keywords = Manifest.stringKeywordsToArray(context.runtime.manifest.keywords);
                        }
                        latestManifest.keywords.forEach(o => {
                            if (!(context.runtime.manifest.keywords as string[]).find(k => k === o)) {
                                (context.runtime.manifest.keywords as string[]).push(o);
                            }
                        });
                    }
                } else {
                    context.runtime.manifest.keywords = latestManifest.keywords;
                }

                //merging input post activities with latest release activities
                if (context.runtime.manifest.postActivities) {
                    if (Array.isArray(latestManifest.postActivities)) {
                        latestManifest.postActivities.forEach(o => {
                            if (!context.runtime.manifest.postActivities.find(k => _.isEqual(k, o))) {
                                context.runtime.manifest.postActivities.push(o);
                            }
                        });
                    }
                } else {
                    context.runtime.manifest.postActivities = latestManifest.postActivities;
                }

                //compare trm dependencies - if automatic dependency search disabled and one or more is missing
                if (context.rawInput.publishData.noDependenciesDetection) {
                    var missingDependencies: TrmManifestDependency[] = [];
                    (latestManifest.dependencies || []).forEach(o => {
                        if (!(context.runtime.manifest.dependencies || []).find(k => {
                            return k.name === o.name && k.registry === o.registry;
                        })) {
                            missingDependencies.push(o);
                        }
                    });
                    if (missingDependencies.length > 0) {
                        Logger.warning(`Latest version of the package had ${missingDependencies.length} ${missingDependencies.length === 1 ? 'dependency that is now missing' : 'dependencies that are now missing'}.`);
                        if (!context.rawInput.contextData.noInquirer) {
                            const inq = await Inquirer.prompt({
                                type: 'select',
                                message: `Include dependencies (if still relevant)`,
                                name: 'dependencies',
                                choices: missingDependencies.map(o => {
                                    var name;
                                    if (o.registry) {
                                        name = `${o.name} (${o.registry})`;
                                    } else {
                                        name = o.name;
                                    }
                                    return {
                                        name,
                                        value: o
                                    };
                                })
                            });
                            context.runtime.manifest.dependencies = (context.runtime.manifest.dependencies || []).concat((inq.dependencies || []));
                        } else {
                            missingDependencies.forEach(o => {
                                if (o.registry) {
                                    Logger.warning(` ${o.name} (${o.registry})`);
                                } else {
                                    Logger.warning(` ${o.name}`);
                                }
                            });
                            Logger.warning(`Include them manually later if still relveant.`);
                        }
                    }
                }
            }
        }

        //2- input manifest values
        if (!context.rawInput.contextData.noInquirer) {
            var defaultAuthors: string;
            var defaultKeywords: string;
            if (Array.isArray(context.runtime.manifest.authors)) {
                defaultAuthors = context.runtime.manifest.authors.map(o => {
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
                defaultAuthors = context.runtime.manifest.authors;
            }
            if (Array.isArray(context.runtime.manifest.keywords)) {
                defaultKeywords = context.runtime.manifest.keywords.join(', ');
            } else {
                defaultKeywords = context.runtime.manifest.keywords;
            }
            var inq = await Inquirer.prompt([{
                type: "input",
                message: "Short description",
                name: "description",
                default: context.runtime.manifest.description,
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
                default: context.runtime.manifest.website,
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
                default: context.runtime.manifest.git,
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
                default: context.runtime.manifest.license
                //validate -> TODO should validate if on public registry!
            }]);
            context.runtime.manifest = { ...context.runtime.manifest, ...inq };
        }

        //3- set namespace values (if necessary)
        if (context.runtime.sapPackage.namespace) {
            context.runtime.manifest.namespace = {
                ns: context.runtime.sapPackage.namespace.trnspacet.namespace,
                replicense: context.runtime.sapPackage.namespace.trnspacet.replicense,
                texts: context.runtime.sapPackage.namespace.trnspacett.map(o => {
                    return {
                        description: o.descriptn,
                        language: o.spras,
                        owner: o.owner
                    };
                })
            };
        }

        //4- set registry endpoint
        if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL) {
            context.runtime.manifest.registry = LOCAL_RESERVED_KEYWORD;
        } else if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PRIVATE) {
            context.runtime.manifest.registry = context.rawInput.packageData.registry.endpoint;
        }

        //5- set post install activities
        if (!context.rawInput.contextData.noInquirer) {
            const inqDefault1 = context.runtime.manifest.postActivities || [];
            const inq = await Inquirer.prompt([{
                message: inqDefault1.length > 0 ? `Do you want to edit ${inqDefault1.length} post activities?` : `Do you want to add post activities?`,
                type: 'confirm',
                name: 'editPostActivities',
                default: false
            }, {
                message: 'Editor post activities',
                type: 'editor',
                name: 'postActivities',
                postfix: '.json',
                when: (hash) => {
                    return hash.editPostActivities
                },
                default: JSON.stringify(inqDefault1.length === 0 ? [{
                    name: '<<class name>>',
                    parameters: [{
                        name: '<<parameter1>>',
                        value: '<<value1>>'
                    }, {
                        name: '<<parameter2>>',
                        value: '<<value2>>'
                    }]
                }] : inqDefault1, null, 2),
                validate: (input) => {
                    try {
                        const parsedInput = JSON.parse(input);
                        if (Array.isArray(parsedInput)) {
                            return true;
                        } else {
                            return 'Invalid array';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if (inq.postActivities) {
                Logger.log(`Post activities were manually changed: before -> ${JSON.stringify(context.runtime.manifest.postActivities)}, after -> ${JSON.parse(inq.postActivities)}`, true);
                context.runtime.manifest.postActivities = JSON.parse(inq.postActivities);
            }
        }
        if (Array.isArray(context.runtime.manifest.postActivities) && context.runtime.manifest.postActivities.length > 0) {
            var removedPostActivities = [];
            Logger.loading(`Checking post activities...`);
            for (var data of context.runtime.manifest.postActivities) {
                if (data.name) {
                    data.name = data.name.trim().toUpperCase();
                    if (!removedPostActivities.find(c => c === data.name)) {
                        if (!(await PostActivity.exists(data.name))) {
                            removedPostActivities.push(data.name);
                        }
                    }
                }
                if (Array.isArray(data.parameters)) {
                    data.parameters.forEach(p => {
                        if (p.name) {
                            p.name = p.name.trim().toUpperCase();
                        }
                    });
                }
            }
            removedPostActivities.forEach(name => {
                Logger.error(`Class "${name}" does not exist and will be removed from post activities list.`);
                context.runtime.manifest.postActivities = context.runtime.manifest.postActivities.filter(o => o.name !== name);
            });
        }

        //6- edit dependencies/sap entries
        if (!context.rawInput.contextData.noInquirer) {
            const inqDefault2 = context.runtime.manifest.dependencies || [];
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
                default: JSON.stringify(inqDefault2.length === 0 ? [{
                    name: '<<name>>',
                    version: '<<version>>',
                    registry: '<<registry?>>'
                }] : inqDefault2, null, 2),
                validate: (input) => {
                    try {
                        const parsedInput = JSON.parse(input);
                        if (Array.isArray(parsedInput)) {
                            return true;
                        } else {
                            return 'Invalid array';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if (inq.dependencies) {
                Logger.log(`Dependencies were manually changed: before -> ${JSON.stringify(context.runtime.manifest.dependencies)}, after -> ${JSON.parse(inq.dependencies)}`, true);
                context.runtime.manifest.dependencies = JSON.parse(inq.dependencies);
            }
        }
        if (!context.rawInput.contextData.noInquirer) {
            const inqDefault3 = context.runtime.manifest.sapEntries || {};
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
                default: JSON.stringify(Object.keys(inqDefault3).length === 0 ? {
                    '<<table>>': [{
                        '<<field1>>': '<<value1>>',
                        '<<field2>>': '<<value2>>'
                    }]
                } : inqDefault3, null, 2),
                validate: (input) => {
                    try {
                        const parsedInput = JSON.parse(input);
                        if (typeof (parsedInput) === 'object' && !Array.isArray(parsedInput)) {
                            return true;
                        } else {
                            return 'Invalid object';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if (inq.sapEntries) {
                Logger.log(`SAP entries were manually changed: before -> ${JSON.stringify(context.runtime.manifest.sapEntries)}, after -> ${JSON.parse(inq.sapEntries)}`, true);
                context.runtime.manifest.sapEntries = JSON.parse(inq.sapEntries);
            }
        }

        //7- normalize manifest values
        context.runtime.manifest = Manifest.normalize(context.runtime.manifest, false);

        //8- transform into xml
        context.runtime.manifestXml = new Manifest(context.runtime.manifest).getAbapXml();

        //9- generate trm package
        context.output.trmPackage = new TrmPackage(context.runtime.manifest.name, context.rawInput.packageData.registry, new Manifest(context.runtime.manifest));
    }
}
