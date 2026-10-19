import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

function objectLabel(object: { pgmid: string, object: string, objName: string }): string {
    return `${object.pgmid.trim()} ${object.object.trim()} ${object.objName.trim()}`;
}

/**
 * Last step of a simulated install (`contextData.simulate`), run instead of the steps that change the system:
 * logs what the install would do, and returns the release manifest without importing anything.
 */
export const simulateInstall: Step<InstallWorkflowContext> = {
    name: 'simulate-install',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const dest = SystemConnector.getDest();
        const manifest = context.runtime.package.data.manifest;
        const installData = context.rawInput.installData;
        const lines: string[] = [`Simulation of ${manifest.name} ${manifest.version} install on ${dest}, nothing was changed. The install would:`];

        if (context.runtime.simulatedNamespace) {
            lines.push(`- import namespace ${context.runtime.simulatedNamespace}`);
        }
        if (!installData.installDevclass.keepOriginal && !context.runtime.isTrmServer) {
            const generated: string[] = [];
            for (const replacement of installData.installDevclass.replacements) {
                if (!(await SystemConnector.getDevclass(replacement.installDevclass))) {
                    generated.push(`${replacement.originalDevclass} -> ${replacement.installDevclass}`);
                }
            }
            if (generated.length > 0) {
                const layer = context.runtime.transportLayer ? ` (transport layer ${context.runtime.transportLayer})` : '';
                lines.push(`- generate SAP packages${layer}:\n${generated.map(o => `    ${o}`).join('\n')}`);
            }
        }
        const packages = installData.installDevclass.replacements.map(o => o.originalDevclass === o.installDevclass ? o.installDevclass : `${o.originalDevclass} -> ${o.installDevclass}`);
        if (packages.length > 0) {
            lines.push(`- install into SAP packages: ${packages.join(', ')}`);
        }

        const transports = context.runtime.transports;
        const imported = [
            installData.installDevclass.keepOriginal ? transports.devc?.binaries?.trkorr : undefined,
            transports.tadir?.binaries?.trkorr,
            transports.lang?.binaries?.trkorr,
            ...(transports.cust || []).map(cust => cust.binaries?.trkorr)
        ].filter(Boolean);
        const objects = transports.tadir?.binaries?.entries?.tadir?.length;
        lines.push(`- import transports ${imported.join(', ')}${objects !== undefined ? ` (${objects} objects)` : ''}`);
        // on update, the objects of the installed release are updated, not overwritten
        const installPackages = new Set(context.runtime.update ? installData.installDevclass.replacements.map(o => o.installDevclass.trim().toUpperCase()) : []);
        const existing = context.runtime.existingObjects || [];
        const updated = existing.filter(o => installPackages.has((o.devclass || '').trim().toUpperCase())).length;
        if (updated > 0) {
            lines.push(`- update ${updated} objects of the installed release`);
        }
        if (existing.length - updated > 0) {
            lines.push(`- overwrite ${existing.length - updated} objects already on ${dest}, outside the installation`);
        }
        if (context.runtime.skippedCust?.length > 0) {
            lines.push(`- skip customizing transports ${context.runtime.skippedCust.join(', ')}`);
        }

        const plan = context.runtime.cleanupPlan;
        if (plan) {
            lines.push(`- back up ${plan.backupObjects.length} objects of ${plan.packageName} ${plan.installedVersion}`);
            if (plan.previewObjects.length > 0) {
                lines.push(`- delete ${plan.previewObjects.length} objects not shipped anymore:\n${plan.previewObjects.map(o => `    ${objectLabel(o)}`).join('\n')}`);
            }
            if (plan.temporaryPackages.length > 0) {
                lines.push(`- delete local SAP packages ${plan.temporaryPackages.map(o => o.objName).join(', ')}`);
            }
            if (plan.excludeObjects.length > 0) {
                lines.push(`- keep ${plan.excludeObjects.length} objects of the installed release:\n${plan.excludeObjects.map(o => `    ${objectLabel(o)}`).join('\n')}`);
            }
            if (plan.previewKeys.length > 0) {
                lines.push(`- delete ${plan.previewKeys.length} customizing keys not shipped anymore:\n${plan.previewKeys.map(o => `    ${o.table} ${o.tabkey}`).join('\n')}`);
            }
        }

        const postActivities = manifest.postActivities || [];
        if (!installData.skipPostActivities && postActivities.length > 0) {
            lines.push(`- execute ${postActivities.length} post activities`);
        }
        const targetSystem = installData.landscapeTransport.targetSystem;
        if (context.runtime.namespace !== '$' && targetSystem) {
            lines.push(`- generate and release a landscape transport to ${targetSystem}`);
        }
        Logger.info(lines.join('\n'));

        context.output = { manifest, simulated: true };
    }
};
