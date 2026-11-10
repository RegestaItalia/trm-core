import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { getPackageHierarchy, getParentFromHierarchy, packageDataFromTdevc } from "../../commons";
import type { DEVCLASS, SCOMPKDTLN, TDEVC } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";
import { addManualStep, isPackageApiUnsupported, logObjectsLocks, logPackageApiUnsupported } from "../commons/utils";

function describePackage(data: SCOMPKDTLN): string {
    return [
        `short text "${data.ctext}"`,
        `software component ${data.dlvunit}`,
        data.pdevclass ? `transport layer ${data.pdevclass}` : undefined,
        data.korrflag ? 'record changes' : undefined,
        data.mainpack ? `main package ${data.mainpack}` : undefined
    ].filter(Boolean).join(', ');
}

/**
 * The SAP package API is unsupported on this release: the user creates the package, then the install goes on.
 * Without prompts the install stops: rerun it once the packages exist (they are reused), or keep the original packages.
 */
async function waitForManualPackage(context: InstallWorkflowContext, data: SCOMPKDTLN): Promise<void> {
    const instructions = `Create SAP package ${data.devclass} in SE21 (${describePackage(data)})`;
    Logger.warning(`SAP package ${data.devclass} can't be created: the SAP package API is unsupported on ${SystemConnector.getDest()}.`, { important: true });
    if (context.rawInput.contextData?.noInquirer) {
        throw new Error(`${instructions}, then rerun the install: existing packages are reused. Alternatively, install keeping the original SAP packages.`);
    }
    while (!(await SystemConnector.getDevclass(data.devclass))) {
        const { created } = await Inquirer.prompt({
            name: 'created',
            type: 'confirm',
            message: `${instructions}. Created?`,
            default: true
        });
        if (!created) {
            throw new Error(`Install aborted: SAP package ${data.devclass} wasn't created.`);
        }
    }
    Logger.log(`SAP package ${data.devclass} created manually`, true);
}

/** Changes the superpackage of an install package; when the SAP package API is unsupported, it's left to do by hand. */
async function setSuperpackage(context: InstallWorkflowContext, devclass: DEVCLASS, superpackage?: DEVCLASS): Promise<void> {
    try {
        if (superpackage) {
            await SystemConnector.setPackageSuperpackage(devclass, superpackage);
        } else {
            await SystemConnector.clearPackageSuperpackage(devclass);
        }
    } catch (error) {
        if (!isPackageApiUnsupported(error)) {
            throw error;
        }
        logPackageApiUnsupported(`Superpackage of ${devclass}`, error);
        // a cleared package is a subpackage: its superpackage is set right after
        if (superpackage) {
            addManualStep(context, `Set the superpackage of SAP package ${devclass} to ${superpackage} in SE21.`);
        }
    }
}

/**
 * Workflow step that validates target SAP packages and creates any that are missing.
 * 
 * 1- find packages to generate
 * 
 * 2- generate missing packages (transportable ones with the transport layer set by set-transport-layer)
 * 
 * 3- build the package hierarchy, based on the original
 * 
 * When the SAP package API is unsupported on the release, a package is created by the user (interactive) and
 * the hierarchy left to do by hand is listed in the summary.
 * 
*/
export const generateDevclass: Step<InstallWorkflowContext> = {
    name: 'generate-devclass',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installDevclass.keepOriginal || context.runtime.isTrmServer) {
            Logger.log(`Skipping generate devclass (user input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- find packages to generated
        Logger.loading(`Checking SAP packages...`);
        const generate: DEVCLASS[] = [];
        const existing = new Set<DEVCLASS>();
        for (const replacement of context.rawInput.installData.installDevclass.replacements) {
            Logger.loading(`Checking existance of devclass ${replacement.installDevclass}...`, true);
            const oDevclass = await SystemConnector.getDevclass(replacement.installDevclass);
            if (oDevclass) {
                Logger.log(`Devclass ${replacement.installDevclass} exists, skipping generation`, true);
                existing.add(replacement.installDevclass);
                if (!context.revert.packageHierarchy.some(pkg => pkg.devclass === oDevclass.devclass)) {
                    context.revert.packageHierarchy.push(oDevclass);
                }
            } else {
                Logger.log(`Devclass ${replacement.installDevclass} doesn't exist, will be generated`, true);
                generate.push(replacement.installDevclass);
            }
        }

        if (existing.size > 0) {
            Logger.loading(`Checking objects locks...`);
            const locks = await SystemConnector.getObjectsLocks(Array.from(existing, devclass => ({
                PGMID: 'R3TR',
                OBJECT: 'DEVC',
                OBJ_NAME: devclass
            })));
            if (locks.length > 0) {
                logObjectsLocks(locks);
                throw new Error(`Install aborted. To continue, all ABAP packages must be released`);
            }
            Logger.log(`All existing SAP packages released, continue`, true);
        }

        //2- generate missing packages
        if (generate.length > 0) {
            const dlvunit = context.runtime.namespace === '$' ? 'LOCAL' : 'HOME';
            if (dlvunit !== 'LOCAL' && !context.runtime.transportLayer) {
                throw new Error(`Transport layer of the new SAP packages was not set.`);
            }
            if (!context.runtime.stopWarningShown) {
                context.runtime.stopWarningShown = true;
                stopWarning('install');
            }
            for (const devclass of generate) {
                Logger.loading(`Creating package ${devclass}...`);
                const originalDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.installDevclass === devclass).originalDevclass;
                Logger.log(`Original devclass ${originalDevclass}`, true);
                const originalPackageData = context.runtime.transports.devc.binaries.entries.tdevc?.find(
                    (o: TDEVC) => o.devclass === originalDevclass
                );
                if (!originalPackageData) {
                    throw new Error(`Original TDEVC data for package ${originalDevclass} was not found.`);
                }
                const ctext = context.runtime.transportEntries.tdevct.find(o => o.devclass === originalDevclass)?.ctext || `TRM ${context.rawInput.packageData.name}`;
                // Track before the mutating await because the package may have been
                // created even when the connector response fails.
                if (!context.revert.sapPackages.includes(devclass)) {
                    context.revert.sapPackages.push(devclass);
                }
                const packageData = packageDataFromTdevc(originalPackageData, {
                    as4user: SystemConnector.getLogonUser(),
                    pdevclass: dlvunit !== 'LOCAL' ? context.runtime.transportLayer : '',
                    devclass,
                    ctext,
                    dlvunit
                });
                try {
                    await SystemConnector.createPackage(packageData);
                } catch (error) {
                    if (!isPackageApiUnsupported(error)) {
                        throw error;
                    }
                    logPackageApiUnsupported(`Create SAP package ${devclass}`, error);
                    // created before the call failed: generated like the others
                    if (!(await SystemConnector.getDevclass(devclass))) {
                        // a rollback must not delete the package the user creates
                        context.revert.sapPackages.splice(context.revert.sapPackages.indexOf(devclass), 1);
                        await waitForManualPackage(context, packageData);
                    }
                }
                if (dlvunit !== 'LOCAL') {
                    await SystemConnector.tadirInterface({
                        pgmid: 'R3TR',
                        object: 'DEVC',
                        objName: devclass,
                        devclass,
                        srcsystem: 'TRM'
                    });
                }
            }
        }

        //3- build the package hierarchy, based on the original
        Logger.loading(`Updating SAP packages hierarchy...`);
        const aDummyTdevc: TDEVC[] = [];
        let parentcl: DEVCLASS;
        for (const packageReplacement of context.rawInput.installData.installDevclass.replacements) {
            parentcl = '';
            const originalRoot = context.runtime.package.hierarchy.devclass === packageReplacement.originalDevclass;
            if (!originalRoot) {
                const originalParentCl = getParentFromHierarchy(context.runtime.package.hierarchy, packageReplacement.originalDevclass);
                if (originalParentCl) {
                    parentcl = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === originalParentCl).installDevclass;
                }
            }
            aDummyTdevc.push({
                devclass: packageReplacement.installDevclass,
                parentcl: parentcl,
                dlvunit: '', // not used
                tpclass: '' // not used
            });
        }
        const installPackageHierarchy = getPackageHierarchy(aDummyTdevc);
        //clear all parentcl, except for root
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }
        for (const packageReplacement of context.rawInput.installData.installDevclass.replacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            if (!installRoot) {
                await setSuperpackage(context, packageReplacement.installDevclass);
            }
        }
        //add parentcl
        for (const packageReplacement of context.rawInput.installData.installDevclass.replacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            const originalParentCl = getParentFromHierarchy(context.runtime.package.hierarchy, packageReplacement.originalDevclass);
            if (originalParentCl) {
                const installParentCl = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === originalParentCl)?.installDevclass;
                if (installParentCl) {
                    if (!installRoot) {
                        await setSuperpackage(context, packageReplacement.installDevclass, installParentCl);
                    }
                }
            }
        }
    }
}
