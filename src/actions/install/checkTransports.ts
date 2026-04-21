import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { normalize } from "../../commons";
import { E071, TRKORR } from "../../client";
import { Inquirer } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Check TRM Package transports. A TRM Package must have one DEVC (ABAP Package) and TADIR (Workbench objects) transports.
 * 
 * Optionally, one LANG (Translation) and one CUST (Customizing) transport.
 * 
 * 1- get transport binaries
 * 
 * 2- check validity of binaries with R3trans
 * 
 * 3- check DEVC transport (one transport)
 * 
 * 4- check TADIR transport (one transport)
 * 
 * 5- check LANG transport (zero or one transport)
 * 
 * 6- check CUST transport
 * 
 * 7- assert no DEVC object in any other transport beside DEVC
 * 
 * 8- assert DEVC transport contains atleast one DEVC object
 * 
 * 9- check existance of trkorr in target system
 * 
*/
export const checkTransports: Step<InstallWorkflowContext> = {
    name: 'check-transports',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check transports step', true);
        var checkExistance: TRKORR[] = [];

        try {
            context.runtime.packageTransportsData = await context.rawInput.packageData.registry.contents(context.rawInput.packageData.name, context.rawInput.packageData.version || 'latest', true);
            context.runtime.remotePackageData.contents = true;
        } catch {
            context.runtime.remotePackageData.contents = false;
        }

        //1- get transport binaries
        Logger.loading(`Checking package transports...`);
        const aTransports = await context.runtime.remotePackageData.artifact.getTransportBinaries(context.rawInput.contextData.r3transOptions, context.runtime.remotePackageData.contents);
        Logger.log(`Package content: ${aTransports.map(o => {
            return {
                trkorr: o.trkorr,
                type: o.type
            }
        })}`, true);

        //2- check validity of binaries with R3trans
        for (const transport of aTransports) {
            const valid = await context.runtime.r3trans.isTransportValid(transport.binaries.data);
            if (valid) {
                Logger.log(`Transport ${transport.trkorr} is valid.`, true);
            } else {
                Logger.error(`Transport ${transport.trkorr} is invalid.`, true);
                throw new Error(`Package contains invalid transports`);
            }
        }
        const aDevcTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.DEVC);
        const aTadirTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.TADIR);
        const aLangTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.LANG);
        const aCustTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.CUST);

        //3- check DEVC transport (one transport)
        if (aDevcTransports.length !== 1) {
            Logger.error(`Zero or multiple DEVC transports found`, true);
            throw new Error(`Unexpected content in package.`);
        } else {
            context.runtime.packageTransports.devc.binaries = aDevcTransports[0];
            Logger.log(`DEVC transport is ${context.runtime.packageTransports.devc.binaries.trkorr}.`, true);
            if (context.rawInput.installData.installDevclass.keepOriginal) {
                checkExistance.push(context.runtime.packageTransports.devc.binaries.trkorr);
            }
        }

        //4- check TADIR transport (one transport)
        if (aTadirTransports.length !== 1) {
            Logger.error(`Zero or multiple TADIR transports found`, true);
            throw new Error(`Unexpected content in package.`);
        } else {
            context.runtime.packageTransports.tadir.binaries = aTadirTransports[0];
            Logger.log(`TADIR transport is ${context.runtime.packageTransports.tadir.binaries.trkorr}.`, true);
            checkExistance.push(context.runtime.packageTransports.tadir.binaries.trkorr);
            if (!context.runtime.remotePackageData.contents) {
                const tadirE071: E071[] = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.tadir.binaries.binaries.data, 'E071'));
                Logger.log(`TADIR E071: ${JSON.stringify(tadirE071)}`, true);
                context.runtime.packageTransportsData.e071 = context.runtime.packageTransportsData.e071.concat(tadirE071);
            }
        }

        //5- check LANG transport (zero or one transport)
        if (aLangTransports.length > 0) {
            if (context.rawInput.installData.import.noLang === undefined) {
                if (!context.rawInput.contextData.noInquirer) {
                    context.rawInput.installData.import.noLang = !(await Inquirer.prompt({
                        type: `confirm`,
                        name: `noLang`,
                        message: `Import translations transport?`,
                        default: true,
                    })).noLang;
                }
            }
            if (!context.rawInput.installData.import.noLang) {
                if (aLangTransports.length !== 1) {
                    Logger.error(`Multiple LANG transports found`, true);
                    throw new Error(`Unexpected content in package.`);
                }
                context.runtime.packageTransports.lang.binaries = aLangTransports[0];
                Logger.log(`LANG transport is ${context.runtime.packageTransports.lang.binaries.trkorr}.`, true);
                checkExistance.push(context.runtime.packageTransports.lang.binaries.trkorr);
                if (!context.runtime.remotePackageData.contents) {
                    const langE071: E071[] = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.lang.binaries.binaries.data, 'E071'));
                    Logger.log(`LANG E071: ${JSON.stringify(langE071)}`, true);
                    context.runtime.packageTransportsData.e071 = context.runtime.packageTransportsData.e071.concat(langE071);
                }
            }
        }

        //6- check CUST transport
        if (aCustTransports.length > 0) {
            if (context.rawInput.installData.import.noCust === undefined) {
                if (!context.rawInput.contextData.noInquirer) {
                    context.rawInput.installData.import.noCust = !(await Inquirer.prompt({
                        type: `confirm`,
                        name: `noCust`,
                        message: `Import ${aCustTransports.length} customizing transport(s)?`,
                        default: true,
                    })).noCust;
                }
            }
            if (!context.rawInput.installData.import.noCust) {
                context.runtime.packageTransports.cust = aCustTransports.map(o => {
                    return {
                        binaries: o
                    };
                });
                Logger.log(`CUST transport are ${context.runtime.packageTransports.cust.map(o => o.binaries.trkorr)}.`, true);
                checkExistance = checkExistance.concat(context.runtime.packageTransports.cust.map(o => o.binaries.trkorr));
                if (!context.runtime.remotePackageData.contents) {
                    var custE071: E071[] = [];
                    for (const transport of context.runtime.packageTransports.cust) {
                        custE071 = custE071.concat(normalize(await context.runtime.r3trans.getTableEntries(transport.binaries.binaries.data, 'E071')));
                    }
                    Logger.log(`CUST E071: ${JSON.stringify(custE071)}`, true);
                    context.runtime.packageTransportsData.e071 = context.runtime.packageTransportsData.e071.concat(custE071);
                }
            }
        }

        //7- assert no DEVC object in any other transport beside DEVC
        if (!context.runtime.remotePackageData.contents) {
            if (context.runtime.packageTransportsData.e071.find(o => o.pgmid === 'R3TR' && o.object === 'DEVC')) {
                throw new Error(`Package has undeclared devclass.`); //all devc object must be in devc transport only
            }
        }

        //8- assert DEVC transport contains atleast one DEVC object
        if (!context.runtime.remotePackageData.contents) {
            var devcE071: E071[] = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.devc.binaries.binaries.data, 'E071'));
            Logger.log(`DEVC E071: ${JSON.stringify(devcE071)}`, true);
            devcE071 = devcE071.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC'); //keep devc only
            if (devcE071.length === 0) {
                throw new Error(`Package has no devclass.`);
            }
            context.runtime.packageTransportsData.e071 = context.runtime.packageTransportsData.e071.concat(devcE071);
        }
        context.runtime.installData.entries = context.runtime.packageTransportsData.e071;

        //9- check existance of trkorr in target system
        Logger.loading(`Checking package transports...`);
        Logger.loading(`Checking if ${checkExistance.length} transports exist before importing them`, true);
        for (const trkorr of checkExistance) {
            const oTransport = new Transport(trkorr);
            const e070 = await oTransport.getE070();
            if (e070) {
                var rewrite = false;
                Logger.warning(`${trkorr} already exists in system!`, true);
                const trmRelevant = await oTransport.isTrmRelevant();
                const linkedPackage = await oTransport.getLinkedPackage();
                if (linkedPackage) {
                    Logger.log(`${trkorr} package is ${linkedPackage.packageName}`, true);
                    if (linkedPackage.compareName(context.runtime.remotePackageData.manifest.name) && linkedPackage.compareRegistry(context.runtime.registry)) {
                        Logger.log(`${trkorr} same package (updating?)`, true);
                        context.runtime.generatedData.tmsTxtRefresh.push(oTransport);
                    } else {
                        Logger.log(`${trkorr} is linked to another package, will later be migrated`, true);
                        rewrite = true;
                    }
                } else if (trmRelevant) {
                    Logger.log(`${trkorr} is TRM relevant but no linked package (could be DEVC, LANG etc..).`, true);
                    context.runtime.generatedData.tmsTxtRefresh.push(oTransport);
                } else {
                    if (await oTransport.isReleased()) {
                        rewrite = true;
                    } else {
                        throw new Error(`Transport ${trkorr} already exists in target system ${SystemConnector.getDest()} and is not released.`);
                    }
                }
                if (rewrite) {
                    Logger.warning(`Transport ${trkorr} already exists in target system ${SystemConnector.getDest()}`);
                    Logger.warning(`If you continue, TRM will replace the content of transport ${trkorr} with the content of the transport with the same number of package "${context.runtime.remotePackageData.manifest.name}".`);
                    Logger.warning(`All of its original content (objects or customizing) will remain untouched, however you may need to manually create a new transport for it.`);
                    Logger.warning(`Consider doing a copy now before the install will replace it.`);
                    if (!context.rawInput.installData.import.replaceExistingTransports) {
                        var continueInstall;
                        if (!context.rawInput.contextData.noInquirer) {
                            continueInstall = (await Inquirer.prompt({
                                name: `continue`,
                                message: `Continue install?`,
                                type: `confirm`,
                                default: true
                            })).continue;
                        } else {
                            continueInstall = false;
                        }
                        if (continueInstall) {
                            //mark with tms refresh after import
                            context.runtime.generatedData.tmsTxtRefresh.push(oTransport);
                        } else {
                            throw new Error(`Transport ${trkorr} already exists in target system ${SystemConnector.getDest()} and transport rewrite was denied.`);
                        }
                    }
                }
            } else {
                Logger.success(`${trkorr} does not exist in system.`, true);
            }
        }
    }
}