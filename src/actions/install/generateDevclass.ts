import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { getPackageHierarchy } from "../../commons";
import { DEVCLASS, TDEVC } from "../../client";
import { SystemConnector } from "../../systemConnector";
import { TrmServerUpgrade } from "../../commons/TrmServerUpgradeService";

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
        if(context.rawInput.installData.installDevclass.keepOriginal){
            Logger.log(`Skipping generate devclass devclass (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Generate devclass step', true);
        
        //2- find packages to generated
        Logger.loading(`Checking ABAP packages...`);
        var generate: DEVCLASS[] = [];
        for(const replacement of context.rawInput.installData.installDevclass.replacements){
            Logger.loading(`Checking existance of devclass ${replacement.installDevclass}...`, true);
            const oDevclass = await SystemConnector.getDevclass(replacement.installDevclass);
            if(oDevclass){
                Logger.log(`Devclass ${replacement.installDevclass} exists, skipping generation`, true);
            }else{
                Logger.log(`Devclass ${replacement.installDevclass} doesn't exist, will be generated`, true);
                generate.push(replacement.installDevclass);
            }
        }
        
        //3- generate missing packages
        if(generate.length > 0){
            const dlvunit = context.runtime.installData.namespace === '$' ? 'LOCAL' : 'HOME';
            for(const devclass of generate){
                Logger.loading(`Creating package ${devclass}...`);
                const originalDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.installDevclass === devclass).originalDevclass;
                Logger.log(`Original devclass ${originalDevclass}`, true);
                const ctext = context.runtime.packageTransportsData.tdevct.find(o => o.devclass === originalDevclass)?.ctext || `TRM ${context.rawInput.packageData.name}`;
                await SystemConnector.createPackage({
                    as4user: SystemConnector.getLogonUser(),
                    pdevclass: context.rawInput.installData.installDevclass.transportLayer,
                    devclass,
                    ctext,
                    dlvunit
                });
                /*if(dlvunit === 'HOME'){
                    wbObjects.push({
                        pgmid: 'LIMU',
                        object: 'ADIR',
                        objName: `R3TRDEVC${devclass}`
                    });
                }*/
                context.runtime.generatedData.devclass.push(devclass);
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

        //4- build the package hierarchy, based on the original
        Logger.loading(`Updating ABAP packages hierarchy...`);
        const aDummyTdevc: TDEVC[] = [];
        const originalPackageHierarchy = getPackageHierarchy(context.runtime.packageTransportsData.tdevc);
        for (const packageReplacement of context.rawInput.installData.installDevclass.replacements) {
            const originalRoot = originalPackageHierarchy.devclass === packageReplacement.originalDevclass;
            var parentcl;
            if(!originalRoot){
                const originalParentCl = context.runtime.packageTransportsData.tdevc.find(o => o.devclass === packageReplacement.originalDevclass).parentcl;
                if(originalParentCl){
                    parentcl = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === originalParentCl).installDevclass;
                }
            }
            aDummyTdevc.push({
                devclass: packageReplacement.installDevclass,
                parentcl: parentcl || ''
            });
        }
        const installPackageHierarchy = getPackageHierarchy(aDummyTdevc);
        //clear all parentcl, except for root
        for (const packageReplacement of context.rawInput.installData.installDevclass.replacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            if (!installRoot) {
                await SystemConnector.clearPackageSuperpackage(packageReplacement.installDevclass);
            }
        }
        //add parentcl
        for (const packageReplacement of context.rawInput.installData.installDevclass.replacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            const originalParentCl = context.runtime.packageTransportsData.tdevc.find(o => o.devclass === packageReplacement.originalDevclass).parentcl;
            if (originalParentCl) {
                const installParentCl = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === originalParentCl)?.installDevclass;
                if(installParentCl){
                    if (!installRoot) {
                        try{
                            await SystemConnector.setPackageSuperpackage(packageReplacement.installDevclass, installParentCl);
                        }catch(e){
                            TrmServerUpgrade.getInstance().throwError(e);
                        }
                    }
                }
            }
        }
    }
}