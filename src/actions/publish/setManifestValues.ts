import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { validate as validateEmail } from "email-validator";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
import { Manifest, PostActivity, TrmManifestAuthor, TrmManifestDependency, validateEngines, validateSapEntries } from "../../manifest";
import { ENGINES_TEMPLATE, getSystemEngines } from "./getSystemEngines";
import { ENGINES_UI_COLUMNS, EnginesUiSection, enginesToUiRows, uiRowsToEngines, validateEnginesUiSection } from "./enginesUi";
import { LOCAL_RESERVED_KEYWORD } from "../../registry/FileSystem";
import _ from 'lodash';
import { TrmPackage } from "../../trmPackage";
import { SystemConnector } from "../../systemConnector";

/**
 * Workflow step that merges, collects, normalizes, and serializes release manifest values.
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
 * 6- edit dependencies/sap entries/engines
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
                context.runtime.manifest.engines ||= latestManifest.engines;

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

                //merging input post activities with latest release activities, by class
                //an input post activity replaces the latest release one of the same class
                if (context.runtime.manifest.postActivities) {
                    if (Array.isArray(latestManifest.postActivities)) {
                        const normalizeClass = (name: string): string => (name || '').trim().toUpperCase();
                        latestManifest.postActivities.forEach(o => {
                            if (!context.runtime.manifest.postActivities.find(k => normalizeClass(k.name) === normalizeClass(o.name))) {
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
            }, Inquirer.isUi() ? {
                type: "input",
                message: "Authors",
                name: "authors",
                ui: {
                    kind: 'table',
                    addLabel: 'Add author',
                    value: Array.isArray(context.runtime.manifest.authors)
                        ? context.runtime.manifest.authors
                        : (defaultAuthors ? Manifest.stringAuthorsToArray(defaultAuthors) : []),
                    columns: [{
                        name: 'name',
                        label: 'Name'
                    }, {
                        name: 'email',
                        label: 'Email',
                        case: 'lower',
                        validate: (value) => validateEmail(value) ? true : 'Invalid email'
                    }]
                }
            } : {
                type: "input",
                message: "Authors (separated by comma)",
                name: "authors",
                default: defaultAuthors
            }, Inquirer.isUi() ? {
                type: "input",
                message: "Keywords",
                name: "keywords",
                ui: {
                    kind: 'tags',
                    case: 'lower',
                    value: defaultKeywords ? Manifest.stringKeywordsToArray(defaultKeywords) : []
                }
            } : {
                type: "input",
                message: "Keywords (separated by comma)",
                name: "keywords",
                default: defaultKeywords
            }, {
                type: "input",
                message: "License",
                name: "license",
                default: context.runtime.manifest.license
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
        } else {
            //derived from the SAP package only: never keep a caller value
            delete context.runtime.manifest.namespace;
        }

        //4- set registry endpoint (derived from the target registry only: never keep a caller value)
        if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.LOCAL) {
            context.runtime.manifest.registry = LOCAL_RESERVED_KEYWORD;
        } else if (context.rawInput.packageData.registry.getRegistryType() === RegistryType.PRIVATE) {
            context.runtime.manifest.registry = context.rawInput.packageData.registry.endpoint;
        } else {
            context.runtime.manifest.registry = PUBLIC_RESERVED_KEYWORD;
        }

        //5- set post install activities
        if (!context.rawInput.contextData.noInquirer && Inquirer.isUi()) {
            const inqDefault1 = context.runtime.manifest.postActivities || [];
            const inq = await Inquirer.prompt({
                message: 'Post activities',
                type: 'input',
                name: 'postActivities',
                ui: {
                    kind: 'table',
                    addLabel: 'Add post activity',
                    value: inqDefault1,
                    columns: [{
                        name: 'name',
                        label: 'Class',
                        required: true,
                        case: 'upper',
                        valueHelp: {
                            key: 'name',
                            columns: [{ name: 'name', label: 'Class' }, { name: 'description', label: 'Description' }],
                            handler: (ctx) => SystemConnector.getPostActivities(ctx)
                        }
                    }, {
                        name: 'parameters',
                        label: 'Parameters',
                        type: 'table',
                        columns: [{
                            name: 'name',
                            label: 'Name',
                            required: true,
                            case: 'upper',
                            valueHelp: {
                                key: 'name',
                                columns: [{ name: 'name', label: 'Parameter' }, { name: 'description', label: 'Description' }],
                                handler: (ctx) => SystemConnector.getPostActivityParameters(ctx.parentRows?.[0]?.name, ctx)
                            }
                        }, {
                            name: 'value',
                            label: 'Value'
                        }]
                    }]
                }
            });
            if (!_.isEqual(inq.postActivities, inqDefault1)) {
                Logger.log(`Post activities were manually changed: before -> ${JSON.stringify(context.runtime.manifest.postActivities)}, after -> ${JSON.stringify(inq.postActivities)}`, true);
                context.runtime.manifest.postActivities = inq.postActivities;
            }
        } else if (!context.rawInput.contextData.noInquirer) {
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
                Logger.log(`Post activities were manually changed: before -> ${JSON.stringify(context.runtime.manifest.postActivities)}, after -> ${JSON.stringify(JSON.parse(inq.postActivities))}`, true);
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

        //6- edit dependencies/sap entries/engines
        if (!context.rawInput.contextData.noInquirer && Inquirer.isUi()) {
            const inqDefault2 = context.runtime.manifest.dependencies || [];
            const inq = await Inquirer.prompt({
                message: 'Dependencies',
                type: 'input',
                name: 'dependencies',
                ui: {
                    kind: 'table',
                    addLabel: 'Add dependency',
                    value: inqDefault2,
                    columns: [{
                        name: 'name',
                        label: 'Name',
                        required: true,
                        case: 'lower'
                    }, {
                        name: 'version',
                        label: 'Version',
                        required: true,
                        placeholder: '^1.0.0',
                        validate: (value) => Manifest.isValidDependencyRange(value) ? true : 'Invalid semver range'
                    }, {
                        name: 'registry',
                        label: 'Registry',
                        placeholder: 'public'
                    }]
                }
            });
            if (!_.isEqual(inq.dependencies, inqDefault2)) {
                Logger.log(`Dependencies were manually changed: before -> ${JSON.stringify(context.runtime.manifest.dependencies)}, after -> ${JSON.stringify(inq.dependencies)}`, true);
                context.runtime.manifest.dependencies = inq.dependencies;
            }
        } else if (!context.rawInput.contextData.noInquirer) {
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
                            const invalid = parsedInput.find(o => !Manifest.isValidDependencyRange(o?.version));
                            return invalid ? `Invalid semver range "${invalid?.version ?? ''}" for dependency "${invalid?.name ?? ''}"` : true;
                        } else {
                            return 'Invalid array';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if (inq.dependencies) {
                Logger.log(`Dependencies were manually changed: before -> ${JSON.stringify(context.runtime.manifest.dependencies)}, after -> ${JSON.stringify(JSON.parse(inq.dependencies))}`, true);
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
                        if (typeof (parsedInput) === 'object' && parsedInput !== null && !Array.isArray(parsedInput)) {
                            const errors = validateSapEntries(parsedInput);
                            return errors.length === 0 ? true : errors[0];
                        } else {
                            return 'Invalid object';
                        }
                    } catch (e) {
                        return 'Invalid JSON';
                    }
                }
            }]);
            if (inq.sapEntries) {
                Logger.log(`SAP entries were manually changed: before -> ${JSON.stringify(context.runtime.manifest.sapEntries)}, after -> ${JSON.stringify(JSON.parse(inq.sapEntries))}`, true);
                context.runtime.manifest.sapEntries = JSON.parse(inq.sapEntries);
            }
        }

        if (!context.rawInput.contextData.noInquirer && Inquirer.isUi()) {
            const hasEngines = !!context.runtime.manifest.engines && Object.keys(context.runtime.manifest.engines).length > 0;
            const inqConfirm = await Inquirer.prompt({
                message: `Do you want to declare engines (SAP system requirements)?`,
                type: 'confirm',
                name: 'editEngines',
                default: hasEngines
            });
            if (inqConfirm.editEngines) {
                var inqDefault4 = hasEngines ? context.runtime.manifest.engines : await getSystemEngines();
                if (inqDefault4 === ENGINES_TEMPLATE) {
                    inqDefault4 = {};
                }
                const rows = enginesToUiRows(inqDefault4);
                const sections: { section: EnginesUiSection, message: string, addLabel: string }[] = [
                    { section: 'components', message: 'Engines: software components', addLabel: 'Add component' },
                    { section: 'products', message: 'Engines: product versions', addLabel: 'Add product' },
                    { section: 'notes', message: 'Engines: SAP Notes', addLabel: 'Add SAP Note' },
                    { section: 'tables', message: 'Engines: table conditions', addLabel: 'Add table condition' }
                ];
                for (const o of sections) {
                    const inq = await Inquirer.prompt({
                        message: o.message,
                        type: 'input',
                        name: o.section,
                        ui: {
                            kind: 'table',
                            addLabel: o.addLabel,
                            value: rows[o.section],
                            columns: ENGINES_UI_COLUMNS[o.section]
                        },
                        validate: (value) => validateEnginesUiSection(o.section, value)
                    });
                    rows[o.section] = inq[o.section] || [];
                }
                const hasAnyOf = Array.isArray(rows.anyOf) && rows.anyOf.length > 0;
                const inqAnyOf = await Inquirer.prompt([{
                    message: hasAnyOf ? `Do you want to edit engines alternatives (anyOf)?` : `Do you want to declare engines alternatives (anyOf)?`,
                    type: 'confirm',
                    name: 'editAnyOf',
                    default: false
                }, {
                    message: 'Edit engines alternatives (anyOf)',
                    type: 'editor',
                    name: 'anyOf',
                    postfix: '.json',
                    when: (hash) => {
                        return hash.editAnyOf
                    },
                    default: JSON.stringify(hasAnyOf ? rows.anyOf : [{
                        components: { '<<COMPONENT>>': { release: '<<release range>>' } }
                    }, {
                        components: { '<<COMPONENT>>': { release: '<<release range>>' } }
                    }], null, 2),
                    validate: (input) => {
                        var parsedInput;
                        try {
                            parsedInput = JSON.parse(input);
                        } catch (e) {
                            return 'Invalid JSON';
                        }
                        if (!Array.isArray(parsedInput)) {
                            return 'Invalid array';
                        }
                        if (parsedInput.length === 0) {
                            return true;
                        }
                        const errors = validateEngines({ anyOf: parsedInput }, { strict: true });
                        return errors.length === 0 ? true : errors[0];
                    }
                }]);
                if (inqAnyOf.anyOf) {
                    rows.anyOf = JSON.parse(inqAnyOf.anyOf);
                }
                var engines = uiRowsToEngines(rows);
                if (Object.keys(engines).length === 0) {
                    engines = undefined;
                }
                if (!_.isEqual(engines, context.runtime.manifest.engines)) {
                    Logger.log(`Engines were manually changed: before -> ${JSON.stringify(context.runtime.manifest.engines)}, after -> ${JSON.stringify(engines)}`, true);
                    context.runtime.manifest.engines = engines;
                }
            }
        } else if (!context.rawInput.contextData.noInquirer) {
            const hasEngines = !!context.runtime.manifest.engines && Object.keys(context.runtime.manifest.engines).length > 0;
            const inqConfirm = await Inquirer.prompt({
                message: `Do you want to declare engines (SAP system requirements)?`,
                type: 'confirm',
                name: 'editEngines',
                default: hasEngines
            });
            if (inqConfirm.editEngines) {
                const inqDefault4 = hasEngines ? context.runtime.manifest.engines : await getSystemEngines();
                const inq = await Inquirer.prompt({
                    message: 'Edit engines',
                    type: 'editor',
                    name: 'engines',
                    postfix: '.json',
                    default: JSON.stringify(inqDefault4, null, 2),
                    validate: (input) => {
                        var parsedInput;
                        try {
                            parsedInput = JSON.parse(input);
                        } catch (e) {
                            return 'Invalid JSON';
                        }
                        const errors = validateEngines(parsedInput, { strict: true });
                        return errors.length === 0 ? true : errors[0];
                    }
                });
                if (inq.engines) {
                    Logger.log(`Engines were manually changed: before -> ${JSON.stringify(context.runtime.manifest.engines)}, after -> ${JSON.stringify(JSON.parse(inq.engines))}`, true);
                    context.runtime.manifest.engines = JSON.parse(inq.engines);
                }
            }
        }

        //7- normalize manifest values
        for (const dependency of (context.runtime.manifest.dependencies || [])) {
            if (!Manifest.isValidDependencyRange(dependency?.version)) {
                throw new Error(`Invalid version range "${dependency?.version ?? ''}" for dependency "${dependency?.name ?? ''}".`);
            }
        }
        context.runtime.manifest = Manifest.normalize(context.runtime.manifest);

        //8- transform into xml
        context.runtime.manifestXml = new Manifest(context.runtime.manifest).getAbapXml();

        //9- generate trm package
        context.output.trmPackage = new TrmPackage(context.runtime.manifest.name, context.rawInput.packageData.registry, new Manifest(context.runtime.manifest));
    }
}
