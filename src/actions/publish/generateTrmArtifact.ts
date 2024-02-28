import { Step } from "@sammarks/workflow";
import { WorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmArtifact } from "../../trmPackage";
import { Transport } from "../../transport";


export const generateTrmArtifact: Step<WorkflowContext> = {
    name: 'generate-trm-artifact',
    run: async (context: WorkflowContext): Promise<void> => {
        Logger.loading(`Generating TRM Artifact...`);
        var aTransports: Transport[] = [];
        aTransports.push(context.runtime.tadirTransport);
        if(context.runtime.langTransport){
            aTransports.push(context.runtime.langTransport);
        }
        aTransports.push(context.runtime.devcTransport);
        context.runtime.artifact = await TrmArtifact.create(aTransports, context.runtime.trmPackage.manifest);
    }
}