import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";

/**
 * Check integrity
 * 
 * 1- check integrity and in safe mode -> if no input integrity skip, but if in safe mode throw exception
 * 
 * 2- compare remote and local integrity
 * 
*/
export const checkIntegrity: Step<InstallWorkflowContext> = {
    name: 'check-integrity',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check integrity step', true);

        //1- check integrity and in safe mode -> if no input integrity skip, but if in safe mode throw exception
        const inputIntegrity = context.rawInput.packageData.integrity;
        const safe = context.rawInput.installData.checks.safe;
        if(!inputIntegrity){
            if(safe){
                throw new Error(`Running in safe mode but no integrity checksum was provided.`);
            }else{
                return;
            }
        }

        //2- compare remote and local integrity
        const trmManifest = context.runtime.remotePackageData.trmManifest;
        const installIntegrity = context.runtime.remotePackageData.integrity;
        if(installIntegrity !== inputIntegrity){
            Logger.warning(`ATTENTION!! Integrity check failed on package ${trmManifest.name}, version ${trmManifest.version}.`);
            Logger.warning(`            Local:  ${inputIntegrity}`);
            Logger.warning(`            Remote: ${installIntegrity}`);
            if(safe){
                Logger.warning(`            Install will continue.`);
            }else{
                throw new Error(`Safe mode: package installation aborted due to integrity check failure.`);
            }
        }
    }
}