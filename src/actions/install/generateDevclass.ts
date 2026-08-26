import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { getPackageHierarchy, getParentFromHierarchy } from "../../commons";
import { DEVCLASS, TDEVC } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";

/**
 * Check ABAP package existance and generate if needed.
 * 
 * 1- find packages to generate
 * 
 * 2- generate missing packages
 * 
 * 3- build the package hierarchy, based on the original
 * 
*/
export const generateDevclass: Step<InstallWorkflowContext> = {
    name: 'generate-devclass',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.installDevclass.keepOriginal || context.runtime.isTrmServer) {
            Logger.log(`Skipping generate devclass devclass (user input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- find packages to generated
        Logger.loading(`Checking ABAP packages...`);
        var generate: DEVCLASS[] = [];
        for (const replacement of context.rawInput.installData.installDevclass.replacements) {
            Logger.loading(`Checking existance of devclass ${replacement.installDevclass}...`, true);
            const oDevclass = await SystemConnector.getDevclass(replacement.installDevclass);
            if (oDevclass) {
                Logger.log(`Devclass ${replacement.installDevclass} exists, skipping generation`, true);
                //TODO: check it's not locked
            } else {
                Logger.log(`Devclass ${replacement.installDevclass} doesn't exist, will be generated`, true);
                generate.push(replacement.installDevclass);
            }
        }

        //2- generate missing packages
        if (generate.length > 0) {
            if (!context.runtime.stopWarningShown) {
                context.runtime.stopWarningShown = true;
                stopWarning('install');
            }
            const dlvunit = context.runtime.namespace === '$' ? 'LOCAL' : 'HOME';
            for (const devclass of generate) {
                Logger.loading(`Creating package ${devclass}...`);
                const originalDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.installDevclass === devclass).originalDevclass;
                Logger.log(`Original devclass ${originalDevclass}`, true);
                const ctext = context.runtime.transportEntries.tdevct.find(o => o.devclass === originalDevclass)?.ctext || `TRM ${context.rawInput.packageData.name}`;
                await SystemConnector.createPackage({
                    as4user: SystemConnector.getLogonUser(),
                    pdevclass: context.rawInput.installData.installDevclass.transportLayer,
                    devclass,
                    ctext,
                    dlvunit
                });
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
        Logger.loading(`Updating ABAP packages hierarchy...`);
        const aDummyTdevc: TDEVC[] = [];
        var parentcl;
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
                await SystemConnector.clearPackageSuperpackage(packageReplacement.installDevclass);
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
                        await SystemConnector.setPackageSuperpackage(packageReplacement.installDevclass, installParentCl);
                    }
                }
            }
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        for(const devclass of context.revert.sapPackages){
            //TODO: sap package was generated, it needs to be removed
            //deletion transport necessary? or function call?
        }
    }
}