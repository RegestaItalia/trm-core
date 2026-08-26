import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { TrmTransportIdentifier } from "../../transport";
import { Inquirer } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { E071, TADIR, TDEVC } from "../../client";
import { adjustTrmServerRestDevclass, getPackageHierarchy } from "../../commons";

/**
 * Get transport entries and check. A TRM Package must have one DEVC (ABAP Package) and TADIR (Workbench objects) transports.
 * 
 * Optionally, one LANG (Translation) and one (or more) CUST (Customizing) transport.
 * 
 * 1- fill lang import
 * 
 * 2- fill cust import
 * 
 * 3- get entries of requested transports
 * 
 * 4- check devc and tadir existance
 * 
 * 5- set original hierarchy
 * 
 * 6- check objects aren't locked
 * 
 * 7- check all object types are supported
 * 
 * 8- check objects existance
 *
*/
export const checkTransports: Step<InstallWorkflowContext> = {
    name: 'check-transports',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var mergedE071: E071[] = [];
        var mergedTDEVC: TDEVC[] = [];
        var mergedTADIR: TADIR[] = [];

        //1- fill lang import
        var importLang = context.rawInput.installData.import.noLang === false;
        if (context.rawInput.installData.import.noLang === undefined && context.runtime.package.data.transports.find(o => o.type === TrmTransportIdentifier.LANG)) {
            if (!context.rawInput.contextData.noInquirer) {
                importLang = (await Inquirer.prompt({
                    name: 'importLang',
                    type: 'confirm',
                    message: `Do you want to import the package translations?`,
                    default: true
                })).importLang;
            } else {
                importLang = false;
            }
        }

        //2- fill cust import
        const custTransports = context.runtime.package.data.transports.filter(o => o.type === TrmTransportIdentifier.CUST);
        var skippedCust: string[] = [];
        if (context.rawInput.installData.import.noCust === undefined) {
            if (!context.rawInput.contextData.noInquirer) {
                for (const cust of custTransports) {
                    const importCust = (await Inquirer.prompt({
                        name: 'importCust',
                        type: 'confirm',
                        message: `Do you want to import customizing "${cust.description}"?`,
                        default: true
                    })).importCust;
                    if (!importCust) {
                        skippedCust.push(cust.trkorr);
                    }
                }
            } else {
                skippedCust = custTransports.map(o => o.trkorr);
            }
        } else if (context.rawInput.installData.import.noCust) {
            skippedCust = custTransports.map(o => o.trkorr);
        }

        //3- get entries of requested transports
        if (context.runtime.isLocal) {
            Logger.loading(`Extracting package transports contents...`);
            const artifact = await context.rawInput.packageData.registry.downloadArtifact(context.runtime.package.data.manifest.name, context.runtime.package.data.manifest.version);
            const binaries = await artifact.getTransportBinaries();
            binaries.forEach(o => {
                switch (o.type) {
                    case TrmTransportIdentifier.DEVC:
                        context.runtime.transports.devc = {
                            binaries: o
                        };
                        mergedE071 = mergedE071.concat(o.entries.e071 || []);
                        mergedTDEVC = mergedTDEVC.concat(o.entries.tdevc || []);
                        context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(o.entries.tdevct || []);
                        mergedTADIR = mergedTADIR.concat(o.entries.tadir || []);
                        break;
                    case TrmTransportIdentifier.TADIR:
                        context.runtime.transports.tadir = {
                            binaries: o
                        };
                        mergedE071 = mergedE071.concat(o.entries.e071 || []);
                        mergedTDEVC = mergedTDEVC.concat(o.entries.tdevc || []);
                        context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(o.entries.tdevct || []);
                        mergedTADIR = mergedTADIR.concat(o.entries.tadir || []);
                        break;
                    case TrmTransportIdentifier.LANG:
                        if (importLang) {
                            context.runtime.transports.lang = {
                                binaries: o
                            };
                            mergedE071 = mergedE071.concat(o.entries.e071 || []);
                            mergedTDEVC = mergedTDEVC.concat(o.entries.tdevc || []);
                            context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(o.entries.tdevct || []);
                            mergedTADIR = mergedTADIR.concat(o.entries.tadir || []);
                        }
                        break;
                    case TrmTransportIdentifier.CUST:
                        if (!skippedCust.includes(o.trkorr)) {
                            context.runtime.transports.cust.push({
                                binaries: o
                            });
                            mergedE071 = mergedE071.concat(o.entries.e071 || []);
                            mergedTDEVC = mergedTDEVC.concat(o.entries.tdevc || []);
                            context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(o.entries.tdevct || []);
                            mergedTADIR = mergedTADIR.concat(o.entries.tadir || []);
                        }
                        break;
                    default:
                        break;
                }
            });
        } else {
            //here we're just reading entries: actual download of transport is done after confirming import of each is allowed
            Logger.loading(`Reading package transports contents...`);
            for (const transport of context.runtime.package.data.transports) {
                var readEntries = true;
                if (!importLang && transport.type === TrmTransportIdentifier.LANG) {
                    readEntries = false;
                }
                if (skippedCust.includes(transport.trkorr)) {
                    readEntries = false;
                }
                if (readEntries) {
                    const entries = await context.rawInput.packageData.registry.transportEntries(
                        context.runtime.package.data.manifest.name,
                        context.runtime.package.data.manifest.version,
                        transport.trkorr
                    );
                    switch (transport.type) {
                        case TrmTransportIdentifier.DEVC:
                            context.runtime.transports.devc.binaries = {
                                binaries: undefined,
                                entries,
                                trkorr: transport.trkorr,
                                type: transport.type as TrmTransportIdentifier
                            };
                            mergedE071 = mergedE071.concat(entries.e071 || []);
                            mergedTDEVC = mergedTDEVC.concat(entries.tdevc || []);
                            context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(entries.tdevct || []);
                            mergedTADIR = mergedTADIR.concat(entries.tadir || []);
                            break;
                        case TrmTransportIdentifier.TADIR:
                            context.runtime.transports.tadir.binaries = {
                                binaries: undefined,
                                entries,
                                trkorr: transport.trkorr,
                                type: transport.type as TrmTransportIdentifier
                            };
                            mergedE071 = mergedE071.concat(entries.e071 || []);
                            mergedTDEVC = mergedTDEVC.concat(entries.tdevc || []);
                            context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(entries.tdevct || []);
                            mergedTADIR = mergedTADIR.concat(entries.tadir || []);
                            break;
                        case TrmTransportIdentifier.LANG:
                            context.runtime.transports.lang.binaries = {
                                binaries: undefined,
                                entries,
                                trkorr: transport.trkorr,
                                type: transport.type as TrmTransportIdentifier
                            };
                            mergedE071 = mergedE071.concat(entries.e071 || []);
                            mergedTDEVC = mergedTDEVC.concat(entries.tdevc || []);
                            context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(entries.tdevct || []);
                            mergedTADIR = mergedTADIR.concat(entries.tadir || []);
                            break;
                        case TrmTransportIdentifier.CUST:
                            context.runtime.transports.cust.push({
                                binaries: {
                                    binaries: undefined,
                                    entries,
                                    trkorr: transport.trkorr,
                                    type: transport.type as TrmTransportIdentifier
                                }
                            });
                            mergedE071 = mergedE071.concat(entries.e071 || []);
                            mergedTDEVC = mergedTDEVC.concat(entries.tdevc || []);
                            context.runtime.transportEntries.tdevct = context.runtime.transportEntries.tdevct.concat(entries.tdevct || []);
                            mergedTADIR = mergedTADIR.concat(entries.tadir || []);
                            break;
                        default:
                            break;
                    }
                }
            }
        }

        //4- check devc and tadir existance
        if (!context.runtime.transports.devc) {
            throw new Error(`Package transport (type DEVC) was not found.`);
        }
        if (!context.runtime.transports.tadir) {
            throw new Error(`Workbench transport (type TADIR) was not found.`);
        }
        if (mergedE071.length === 0) {
            throw new Error(`Package transports contain no objects.`);
        }

        //5- set original hierarchy
        try {
            context.runtime.package.hierarchy = getPackageHierarchy(mergedTDEVC);
        } catch (e) {
            throw new Error(`Original SAP packages hierarchy inconsistency: ${e.toString()}`);
        }

        //6- check objects aren't locked
        //all e071 type R3TR, excluding DEVC. DEVC will be checked for locks later when user may decide new package names
        Logger.loading(`Checking objects locks...`);
        const locks = await SystemConnector.getObjectsLocks(mergedE071.map(o => {
            return {
                PGMID: o.pgmid,
                OBJECT: o.object,
                OBJ_NAME: o.objName
            };
        }));
        if (locks.length > 0) {
            locks.forEach(l => {
                Logger.error(`${l.pgmid} ${l.object} ${l.objName} is currently locked in transport ${l.trkorr}`);
            });
            throw new Error(`Install aborted. To continue, all objects must be released`);
        } else {
            Logger.log(`All objects released, DEVC locks will be checked later`, true);
        }

        //7- check all object types are supported
        Logger.loading(`Checking objects support...`);
        var missingTypes: string[] = [];
        const systemObjectList = await SystemConnector.getObjectsList();
        mergedE071.forEach(o => {
            if (!systemObjectList.find(k => k.pgmid === o.pgmid && k.object === o.object) && !missingTypes.includes(`${o.pgmid} ${o.object}`)) {
                missingTypes.push(`${o.pgmid} ${o.object}`);
            }
        });
        if (missingTypes.length > 0) {
            throw new Error(`Package contains objects that aren't supported in your system: ${missingTypes.join(', ')}`);
        }

        //8- check objects existance
        var existingObjects: TADIR[] = [];
        const checkTadir = mergedTADIR.map(o => {
            return {
                ...o, ...{
                    devclass: context.runtime.isTrmServer || context.runtime.isTrmRest ? adjustTrmServerRestDevclass(o.devclass) : o.devclass
                }
            }
        });
        if (!SystemConnector.getSupportedBulk().getTransportObjects) {
            existingObjects = await SystemConnector.getExistingObjects(checkTadir);
        } else {
            existingObjects = await SystemConnector.getExistingObjectsBulk(checkTadir);
        }
        Logger.log(`TADIR object that already exist in system: ${JSON.stringify(existingObjects)}`, true);
        //if updating and existing object is part of the package (devclass in hierarchy) ok, else throw error
        var throwExistingObjectsError = false;
        if (existingObjects.length > 0) {
            const sObjs = existingObjects.map(o => `${o.pgmid} ${o.object} ${o.objName}`).join('\n');
            if (context.runtime.update) {
                const rootPackage = context.rawInput.contextData.systemPackages.find(o => o.packageName === context.rawInput.packageData.name);
                if (rootPackage) {
                    const rootDevclass = rootPackage.getDevclass();
                    if (rootDevclass) {
                        const subpackages = (await SystemConnector.getSubpackages(rootDevclass)).map(o => o.devclass);
                        existingObjects.forEach(o => {
                            if (subpackages.includes(o.devclass) || rootDevclass === o.devclass) {
                                Logger.log(`${o.pgmid} ${o.object} ${o.objName} already in system but devclass ${o.devclass} is part of the same trm package in update`, true);
                            } else {
                                if (context.rawInput.installData.checks.noExistingObjects) {
                                    Logger.warning(`${o.pgmid} ${o.object} ${o.objName} already exist on target system ${SystemConnector.getDest()}`);
                                } else {
                                    Logger.error(`${o.pgmid} ${o.object} ${o.objName} already exist on target system ${SystemConnector.getDest()}`);
                                }
                                throwExistingObjectsError = true;
                            }
                        });
                        if (throwExistingObjectsError && !context.rawInput.installData.checks.noExistingObjects) {
                            throw new Error(`Cannot overwrite existing objects.`);
                        }
                    } else {
                        if (context.rawInput.installData.checks.noExistingObjects || context.rawInput.contextData.noInquirer) {
                            Logger.warning(`${existingObjects.length} object(s) already exist on target system ${SystemConnector.getDest()}:\n${sObjs}`);
                        } else {
                            const ow = (await Inquirer.prompt({
                                message: `Couldn't determine root SAP package for "${rootPackage.packageName}", ${existingObjects.length} object(s) already exist on target system ${SystemConnector.getDest()}. Continue?`,
                                type: 'confirm',
                                name: 'ow',
                                default: true
                            })).ow;
                            if (!ow) {
                                throw new Error(`${existingObjects.length} object(s) already exist on target system ${SystemConnector.getDest()}:\n${sObjs}`);
                            }
                        }
                    }
                } else {
                    if (!context.rawInput.installData.checks.noExistingObjects) {
                        throw new Error(`${existingObjects.length} object(s) already exist on target system ${SystemConnector.getDest()}:\n${sObjs}`);
                    }
                }
            } else {
                if (context.rawInput.installData.checks.noExistingObjects) {
                    Logger.warning(`${existingObjects.length} object(s) already exist on target system ${SystemConnector.getDest()}:\n${sObjs}`);
                } else {
                    throw new Error(`${existingObjects.length} object(s) already exist on target system ${SystemConnector.getDest()}, install without object check (expert mode)`);
                }
            }
        }
    }
}
