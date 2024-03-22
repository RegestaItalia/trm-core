import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { createHash } from "crypto";

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
        const oArtifact = context.runtime.trmArtifact;
        const installIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
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