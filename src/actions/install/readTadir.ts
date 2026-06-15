import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { adjustTrmServerRestDevclass, normalize } from "../../commons";
import { SystemConnector } from "../../systemConnector";
import { TADIR } from "../../client";

/**
 * Read TADIR and check objects existance on target system.
 * 
 * 1- read TADIR
 * 
 * 2- check objects existance
 * 
*/
export const readTadir: Step<InstallWorkflowContext> = {
    name: 'read-tadir',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Read tadir step', true);

        Logger.loading(`Reading objects transport...`);

        //1- read TADIR
        if (!context.runtime.remotePackageData.contents) {
            context.runtime.packageTransportsData.tadir = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.tadir.binaries.binaries.data, 'TADIR'));
        }else{
            //sanitize contents
            //this is not 100% right but registry will mix all transports entries, so it's necessary to filter atleast R3TR and no DEVC
            context.runtime.packageTransportsData.tadir = context.runtime.packageTransportsData.tadir.filter(o => o.pgmid === 'R3TR' && !(o.pgmid === 'R3TR' && o.object === 'DEVC'))
        }
        Logger.log(`TADIR TADIR: ${JSON.stringify(context.runtime.packageTransportsData.tadir)}`, true);

        //2- check objects existance
        var existingObjects: TADIR[] = [];
        //check support for bulk operations
        const checkTadir = context.runtime.packageTransportsData.tadir.map(o => {
            return {
                ...o, ...{
                    devclass: context.runtime.isTrmServerRest ? adjustTrmServerRestDevclass(o.devclass) : o.devclass
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