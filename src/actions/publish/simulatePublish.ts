import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Last step of a simulated publish (`contextData.simulate`), run instead of the steps that create transports and
 * publish: logs what the publish would do, and returns the release package without an artifact.
 */
export const simulatePublish: Step<PublishWorkflowContext> = {
    name: 'simulate-publish',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        const manifest = context.runtime.manifest;
        const packageData = context.rawInput.packageData;
        const publishData = context.rawInput.publishData;
        const objects = context.runtime.sapPackage.objects;
        const lines: string[] = [`Simulation of ${manifest.name} ${manifest.version} publish, nothing was changed on ${SystemConnector.getDest()} or the registry. The publish would:`];

        const transports = ['DEVC', 'TADIR'];
        if (!publishData.noLanguageTransport) {
            transports.push('LANG (when the package has translations)');
        }
        if (!publishData.noCustomizingTransports && context.runtime.customizing.new.length > 0) {
            transports.push(`CUST (${context.runtime.customizing.new.map(o => o.trkorr).join(', ')})`);
        }
        lines.push(`- generate and release transports ${transports.join(', ')}${context.rawInput.systemData.transportTarget ? ` to ${context.rawInput.systemData.transportTarget}` : ''}`);
        lines.push(`- include ${objects.length} objects of SAP package ${packageData.devclass}`);
        const excluded = context.runtime.abapGit.excludedObjects || [];
        if (excluded.length > 0) {
            lines.push(`- exclude ${excluded.length} objects from the source code`);
        }
        if (context.runtime.customizing.retained.length > 0) {
            lines.push(`- carry over customizing ${context.runtime.customizing.retained.map(o => o.trkorr).join(', ')} from the latest release`);
        }
        const dependencies = manifest.dependencies || [];
        if (dependencies.length > 0) {
            lines.push(`- depend on ${dependencies.map(o => `${o.name} ${o.version}`).join(', ')}`);
        }
        lines.push(`- publish ${manifest.private ? 'private ' : ''}release ${manifest.version} to ${packageData.registry.name}${packageData.tags.length > 0 ? ` with tags ${packageData.tags.join(', ')}` : ''}`);
        Logger.info(lines.join('\n'));

        context.output.simulated = true;
    }
};
