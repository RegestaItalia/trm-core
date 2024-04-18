import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";

export const checkIntegrity: Step<InstallWorkflowContext> = {
    name: 'check-integrity',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(!context.parsedInput.installIntegrity){
            Logger.log(`Skipping integrity check (input not provided)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const trmManifest = context.runtime.trmManifest;
        const installIntegrity = context.runtime.fetchedIntegrity;
        const inputIntegrity = context.parsedInput.installIntegrity;
        const safe = context.parsedInput.safeInstall;
        if(installIntegrity !== inputIntegrity){
            Logger.warning(`ATTENTION!! Integrity check failed on package ${trmManifest.name}, version ${trmManifest.version}.`);
            Logger.warning(`            Local:  ${inputIntegrity}`);
            Logger.warning(`            Remote: ${installIntegrity}`);
            if(safe){
                Logger.warning(`            Install will continue.`);
            }else{
                throw new Error(`Package installation aborted due to integrity check failure and running in safe mode.`);
            }
        }
    }
}