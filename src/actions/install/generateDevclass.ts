import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { getPackageHierarchy, getPackageNamespace } from "../../commons";
import { TDEVC } from "../../client";

export const generateDevclass: Step<InstallWorkflowContext> = {
    name: 'generate-devclass',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        const packageReplacements = context.runtime.packageReplacements;
        if (packageReplacements && packageReplacements.length > 0) {
            return true;
        } else {
            Logger.log(`Skip generate devclass (no package replacements)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var pdevclass = context.parsedInput.transportLayer;
        const packageReplacements = context.runtime.packageReplacements;
        const packageName = context.parsedInput.packageName;
        const tdevct = context.runtime.tdevctData;
        const dlvunit = getPackageNamespace(packageReplacements[0].installDevclass) === '$' ? 'LOCAL' : 'HOME';
        context.runtime.generatedDevclass = [];
        Logger.loading(`Generating packages...`);
        for (const packageReplacement of packageReplacements) {
            const devclassExists = await SystemConnector.getDevclass(packageReplacement.installDevclass);
            const oDevcTadir = {
                pgmid: 'R3TR',
                object: 'DEVC',
                objName: packageReplacement.installDevclass,
                devclass: packageReplacement.installDevclass
            };
            if (!devclassExists) {
                Logger.loading(`Generating "${packageReplacement.installDevclass}"...`);
                //generate
                if (!pdevclass) {
                    pdevclass = await SystemConnector.getDefaultTransportLayer();
                }
                const ctext = tdevct.find(o => o.devclass === packageReplacement.originalDevclass)?.ctext || `TRM ${packageName}`;
                await SystemConnector.createPackage({
                    devclass: packageReplacement.installDevclass,
                    as4user: SystemConnector.getLogonUser(),
                    ctext,
                    dlvunit,
                    pdevclass
                });
                context.runtime.generatedDevclass.push(packageReplacement.installDevclass);
                /*if(dlvunit === 'HOME'){
                    wbObjects.push({
                        pgmid: 'LIMU',
                        object: 'ADIR',
                        objName: `R3TRDEVC${packageReplacement.installDevclass}`
                    });
                }*/
            }
            if (dlvunit !== 'LOCAL') {
                await SystemConnector.tadirInterface(oDevcTadir);
                context.runtime.tadirData.push(oDevcTadir);
            }
        }
        Logger.loading(`Finalizing packages...`);
        //build the new package hierarchy, based on the original
        const aDummyTdevc: TDEVC[] = [];
        const originalPackageHierarchy = context.runtime.originalPackageHierarchy;
        const tdevc = context.runtime.tdevcData;
        for (const packageReplacement of packageReplacements) {
            const originalRoot = originalPackageHierarchy.devclass === packageReplacement.originalDevclass;
            var parentcl;
            if(!originalRoot){
                const originalParentCl = tdevc.find(o => o.devclass === packageReplacement.originalDevclass).parentcl;
                if(originalParentCl){
                    parentcl = packageReplacements.find(o => o.originalDevclass === originalParentCl).installDevclass;
                }
            }
            aDummyTdevc.push({
                devclass: packageReplacement.installDevclass,
                parentcl: parentcl || ''
            });
        }
        const installPackageHierarchy = getPackageHierarchy(aDummyTdevc);
        //clear all parentcl, except for root
        for (const packageReplacement of packageReplacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            if (!installRoot) {
                await SystemConnector.clearPackageSuperpackage(packageReplacement.installDevclass);
            }
        }
        //add parentcl
        for (const packageReplacement of packageReplacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            const originalParentCl = tdevc.find(o => o.devclass === packageReplacement.originalDevclass).parentcl;
            if (originalParentCl) {
                const installParentCl = packageReplacements.find(o => o.originalDevclass === originalParentCl)?.installDevclass;
                if(installParentCl){
                    if (!installRoot) {
                        await SystemConnector.setPackageSuperpackage(packageReplacement.installDevclass, installParentCl);
                    }
                }
            }
        }
        Logger.success(`Packages generated.`);
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        //delete devclass only if they were actually generated in the step
        const devclassDelete = context.runtime.generatedDevclass;
        for(const devclass of devclassDelete){
            Logger.loading(`Rollback "${devclass}"...`);
            try{
                //TODO (abapGit integration #33) delete devclass
                Logger.info(`Rollback "${devclass}"`);
            }catch(e){
                Logger.info(`Unable to rollback "${devclass}"`);
                Logger.error(e.toString(), true);
            }
        }
    }
}