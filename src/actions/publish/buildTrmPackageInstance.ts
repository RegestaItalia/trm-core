import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Manifest } from "../../manifest";
import { TrmPackage } from "../../trmPackage";

export const buildTrmPackageInstance: Step<PublishWorkflowContext> = {
    name: 'build-trm-package-instance',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        context.runtime.manifest = Manifest.normalize(context.runtime.manifest, false);
        const oManifest = new Manifest(context.runtime.manifest);
        context.runtime.trmPackage = new TrmPackage(context.runtime.manifest.name, context.runtime.registry, oManifest);
    }
}