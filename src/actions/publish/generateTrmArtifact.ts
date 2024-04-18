import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmArtifact } from "../../trmPackage";
import { Transport } from "../../transport";


export const generateTrmArtifact: Step<PublishWorkflowContext> = {
    name: 'generate-trm-artifact',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.loading(`Generating TRM Artifact...`);
        var aTransports: Transport[] = [];
        aTransports.push(context.runtime.tadirTransport);
        if(context.runtime.langTransport){
            aTransports.push(context.runtime.langTransport);
        }
        if(context.runtime.custTransport){
            aTransports.push(context.runtime.custTransport);
        }
        aTransports.push(context.runtime.devcTransport);
        context.runtime.artifact = await TrmArtifact.create(aTransports, context.runtime.trmPackage.manifest);
    }
}